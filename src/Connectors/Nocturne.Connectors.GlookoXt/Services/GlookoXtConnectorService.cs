using Microsoft.Extensions.Logging;
using Nocturne.Connectors.Core.Interfaces;
using Nocturne.Connectors.Core.Models;
using Nocturne.Connectors.Core.Services;
using Nocturne.Connectors.Core.Utilities;
using Nocturne.Connectors.GlookoXt.Configurations;
using Nocturne.Connectors.GlookoXt.Mappers;
using Nocturne.Connectors.GlookoXt.Models;
using System.Collections.Concurrent;
using Nocturne.Core.Constants;

namespace Nocturne.Connectors.GlookoXt.Services;

/// <summary>
///     Pulls a Glooko XT patient account into Nocturne. One Socket.IO session per sync reads
///     <c>GET_COLLECTED_DATA</c> a week at a time from the resume point to now, and every record
///     is fanned out by <see cref="GlookoXtRecordMapper"/> into the types the tenant has enabled.
///     Glooko XT is a logbook, not a live feed: nothing here pushes data back.
/// </summary>
public class GlookoXtConnectorService : BaseConnectorService<GlookoXtConnectorConfiguration>
{
    private readonly IGlookoXtDataClient _dataClient;
    private readonly GlookoXtRecordMapper _mapper;
    private readonly GlookoXtExportMapper _exportMapper;
    private readonly GlookoXtAuthTokenProvider _tokenProvider;

    /// <summary>
    ///     The device catalogue is the same for every patient and changes when Glooko adds a
    ///     product, so one copy per process, refreshed daily, serves every tenant's sync.
    /// </summary>
    private static readonly ConcurrentDictionary<string, (DateTime FetchedAt, IReadOnlyDictionary<long, string> Names)> ProductCatalogue = new();
    private static readonly TimeSpan ProductCatalogueLifetime = TimeSpan.FromHours(24);
    private static readonly string[] ProductTypes = ["pump", "cgm", "bgm"];

    public GlookoXtConnectorService(
        HttpClient httpClient,
        IConnectorServerResolver<GlookoXtConnectorConfiguration> serverResolver,
        ILogger<GlookoXtConnectorService> logger,
        GlookoXtAuthTokenProvider tokenProvider,
        IGlookoXtDataClient dataClient,
        IConnectorPublisher? publisher = null)
        : base(httpClient, serverResolver, logger, publisher)
    {
        _tokenProvider = tokenProvider ?? throw new ArgumentNullException(nameof(tokenProvider));
        _dataClient = dataClient ?? throw new ArgumentNullException(nameof(dataClient));
        _mapper = new GlookoXtRecordMapper(logger);
        _exportMapper = new GlookoXtExportMapper(logger);
    }

    protected override string ConnectorSource => DataSources.GlookoXtConnector;
    public override string ServiceName => "Glooko XT";

    /// <summary>
    ///     Records the patient logs by hand reach the server whenever they open the app, so a window
    ///     that ends at "now" misses the entry they typed a minute ago with a timestamp a minute
    ///     ahead of the server clock. A little slack past now costs nothing.
    /// </summary>
    private static readonly TimeSpan FutureSlack = TimeSpan.FromHours(1);

    protected override async Task<SyncResult> PerformSyncInternalAsync(
        SyncRequest request,
        GlookoXtConnectorConfiguration config,
        CancellationToken cancellationToken)
    {
        var result = new SyncResult { StartTime = DateTimeOffset.UtcNow, Success = true };
        var activeTypes = ResolveActiveTypes(request, config);

        if (activeTypes.Count == 0)
        {
            result.EndTime = DateTimeOffset.UtcNow;
            return result;
        }

        var token = await _tokenProvider.GetValidTokenAsync(config, cancellationToken);
        if (string.IsNullOrEmpty(token))
        {
            TrackFailedRequest("No valid token");
            result.Attention = ConnectorAttention.ReconnectRequired();
            return Fail(result, _tokenProvider.LastFailure
                ?? "Glooko XT is not connected. Open the connector settings and sign in with the code Glooko XT emails you.");
        }

        // The token cannot be renewed without the tenant at their email, so a lapse in sight is
        // worth telling them about while every sync still succeeds.
        if (GlookoXtJwt.TryGetExpiry(token) is { } expiry && expiry - DateTime.UtcNow <= GlookoXtConstants.ReconnectNotice)
            result.Attention = ConnectorAttention.ReconnectSoon(expiry);

        var (from, to) = await ResolveWindowAsync(request, config);
        if (from >= to)
        {
            result.EndTime = DateTimeOffset.UtcNow;
            return result;
        }

        List<GlookoXtRecord> records;
        IReadOnlyDictionary<long, string> productNames;
        List<GlookoXtExport> exports;
        GlookoXtAccount? account;
        try
        {
            (records, productNames, exports, account) = await FetchAsync(config, token, from, to, activeTypes, cancellationToken);
        }
        catch (GlookoXtAuthenticationException ex)
        {
            _logger.LogWarning(ex, "[{ConnectorSource}] Glooko XT refused the stored sign-in", ConnectorSource);
            _tokenProvider.InvalidateToken();
            TrackFailedRequest(ex.Message);
            result.Attention = ConnectorAttention.ReconnectRequired();
            return Fail(result,
                "Glooko XT refused the stored sign-in. Open the connector settings and sign in again with a new emailed code.");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "[{ConnectorSource}] Fetching Glooko XT records failed", ConnectorSource);
            TrackFailedRequest(ex.Message);
            return Fail(result, $"Could not read from Glooko XT: {ex.Message}");
        }

        TrackSuccessfulRequest();
        _logger.LogInformation(
            "[{ConnectorSource}] Fetched {Count} Glooko XT records for {From:O}..{To:O}",
            ConnectorSource, records.Count, from, to);

        if (!GlookoXtGlucoseUnits.IsKnownSetting(config.GlucoseUnit))
            _logger.LogWarning(
                "[{ConnectorSource}] Unknown glucose unit setting {Setting}; inferring from the data",
                ConnectorSource, config.GlucoseUnit);

        var unitSetting = GlookoXtGlucoseUnits.Effective(config.GlucoseUnit, account?.Unit);
        if (account?.Unit is null)
            _logger.LogDebug("[{ConnectorSource}] Glooko XT profile did not state a glucose unit; inferring from the readings", ConnectorSource);

        var batch = _mapper.Map(records, unitSetting, productNames);
        _exportMapper.Map(exports, unitSetting, batch);
        if (batch.Skipped > 0)
            _logger.LogDebug("[{ConnectorSource}] {Skipped} Glooko XT records carried nothing to import", ConnectorSource, batch.Skipped);

        await PublishRecordTypeAsync(result, SyncDataType.Glucose, activeTypes, batch.SensorGlucose, PublishSensorGlucoseDataAsync, config, cancellationToken);
        await PublishRecordTypeAsync(result, SyncDataType.ManualBG, activeTypes, batch.BGChecks, PublishBGCheckDataAsync, config, cancellationToken);
        await PublishRecordTypeAsync(result, SyncDataType.Boluses, activeTypes, batch.Boluses, PublishBolusDataAsync, config, cancellationToken);
        await PublishRecordTypeAsync(result, SyncDataType.BolusCalculations, activeTypes, batch.BolusCalculations, PublishBolusCalculationDataAsync, config, cancellationToken);
        await PublishRecordTypeAsync(result, SyncDataType.BasalInjections, activeTypes, batch.BasalInjections, PublishBasalInjectionDataAsync, config, cancellationToken);
        await PublishRecordTypeAsync(result, SyncDataType.CarbIntake, activeTypes, batch.CarbIntakes, PublishCarbIntakeDataAsync, config, cancellationToken);
        await PublishRecordTypeAsync(result, SyncDataType.TempBasals, activeTypes, batch.TempBasals, PublishTempBasalDataAsync, config, cancellationToken);
        await PublishRecordTypeAsync(result, SyncDataType.DeviceEvents, activeTypes, batch.DeviceEvents, PublishDeviceEventDataAsync, config, cancellationToken);
        // Pump alarms ride the device-event toggle, as they do for every pump connector.
        await PublishRecordTypeAsync(result, SyncDataType.DeviceEvents, activeTypes, batch.SystemEvents, PublishSystemEventDataAsync, config, cancellationToken, "alarms");
        await PublishRecordTypeAsync(result, SyncDataType.StateSpans, activeTypes, batch.StateSpans, PublishStateSpanDataAsync, config, cancellationToken);
        await PublishRecordTypeAsync(result, SyncDataType.Profiles, activeTypes, batch.Profiles, PublishProfileDataAsync, config, cancellationToken);
        await PublishRecordTypeAsync(result, SyncDataType.Notes, activeTypes, batch.Notes, PublishNoteDataAsync, config, cancellationToken);

        result.EndTime = DateTimeOffset.UtcNow;
        return result;
    }

    /// <summary>
    ///     The window one run reads. Glooko XT has no cursor of its own, so the lower bound is the
    ///     older of the glucose and treatment resume points — one read serves every family — or the
    ///     caller's explicit bound, and a run with no stored data at all starts at the initial floor.
    /// </summary>
    private async Task<(DateTime From, DateTime To)> ResolveWindowAsync(
        SyncRequest request, GlookoXtConnectorConfiguration config)
    {
        var floor = InitialSyncFloor ?? DefaultInitialSyncFloor();

        var glucoseSince = await CalculateSinceTimestampAsync(config);
        var treatmentSince = await CalculateTreatmentSinceTimestampAsync(config);
        var resumePoint = Earliest(glucoseSince, treatmentSince) ?? floor;

        var from = ResumeFrom(request, resumePoint - GlookoXtConstants.ResumeOverlap, floor);
        var to = request.To ?? DateTime.UtcNow + FutureSlack;

        return (DateTime.SpecifyKind(from, DateTimeKind.Utc), DateTime.SpecifyKind(to, DateTimeKind.Utc));
    }

    private static DateTime? Earliest(DateTime? a, DateTime? b)
    {
        if (a is null) return b;
        if (b is null) return a;
        return a < b ? a : b;
    }

    /// <summary>The export types: what only the CSV carries. A run that asks for none of them skips the export.</summary>
    private static readonly SyncDataType[] ExportTypes = [SyncDataType.StateSpans, SyncDataType.Profiles, SyncDataType.DeviceEvents];

    private async Task<(List<GlookoXtRecord> Records, IReadOnlyDictionary<long, string> ProductNames, List<GlookoXtExport> Exports, GlookoXtAccount? Account)> FetchAsync(
        GlookoXtConnectorConfiguration config, string token, DateTime from, DateTime to, HashSet<SyncDataType> activeTypes, CancellationToken ct)
    {
        var serverUrl = _serverResolver.Resolve(config)?.GetLeftPart(UriPartial.Authority) ?? GlookoXtConstants.ServerUrl;
        var all = new List<GlookoXtRecord>();

        await using var session = await _dataClient.ConnectAsync(serverUrl, token, ct);

        var productNames = await ProductNamesAsync(session, serverUrl, ct);
        var account = await AccountAsync(session, ct);

        foreach (var (chunkFrom, chunkTo) in DateChunker.Chunk(from, to, GlookoXtConstants.FetchChunk))
        {
            ct.ThrowIfCancellationRequested();
            await ReportSyncMessageAsync(SyncMessageType.FetchingData,
                new() { ["from"] = chunkFrom.ToString("O"), ["to"] = chunkTo.ToString("O") }, ct);

            all.AddRange(await session.GetCollectedDataAsync(chunkFrom, chunkTo, ct));
        }

        // A window boundary can hand the same record back twice; the server id is its identity.
        var records = all
            .GroupBy(r => r.Id ?? long.MinValue)
            .SelectMany(g => g.Key == long.MinValue ? g : g.Take(1))
            .ToList();

        var exports = new List<GlookoXtExport>();
        if (ExportTypes.Any(activeTypes.Contains))
        {
            // The export is asked for by calendar day in the account's zone; a day of slack on each
            // side covers the zone offset the window's UTC bounds do not know about.
            var firstDay = DateOnly.FromDateTime(from.AddDays(-1));
            var lastDay = DateOnly.FromDateTime(to.AddDays(1));
            for (var day = firstDay; day <= lastDay; day = day.AddDays(GlookoXtConstants.ExportChunk.Days))
            {
                ct.ThrowIfCancellationRequested();
                var chunkEnd = day.AddDays(GlookoXtConstants.ExportChunk.Days - 1);
                if (chunkEnd > lastDay) chunkEnd = lastDay;
                exports.Add(await session.ExportRecordsAsync(day, chunkEnd, ct));
            }
        }

        return (records, productNames, exports, account);
    }

    /// <summary>The account settings, or null when they could not be read; a sync never fails on the profile.</summary>
    private async Task<GlookoXtAccount?> AccountAsync(IGlookoXtSession session, CancellationToken ct)
    {
        try
        {
            return await session.GetAccountAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "[{ConnectorSource}] Could not read the Glooko XT account settings", ConnectorSource);
            return null;
        }
    }

    /// <summary>
    ///     Product id to device name, from the process-wide catalogue or a fresh read of it. A
    ///     catalogue that cannot be read costs the names, not the sync: records are stamped with
    ///     their sync source instead.
    /// </summary>
    private async Task<IReadOnlyDictionary<long, string>> ProductNamesAsync(IGlookoXtSession session, string serverUrl, CancellationToken ct)
    {
        if (ProductCatalogue.TryGetValue(serverUrl, out var cached) && DateTime.UtcNow - cached.FetchedAt < ProductCatalogueLifetime)
            return cached.Names;

        var names = new Dictionary<long, string>();
        try
        {
            foreach (var type in ProductTypes)
            {
                foreach (var product in await session.GetProductsAsync(type, ct))
                {
                    if (product.Id is { } id && !string.IsNullOrWhiteSpace(product.Name))
                        names[id] = product.Name;
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "[{ConnectorSource}] Could not read the Glooko XT device catalogue; records keep their sync source as device", ConnectorSource);
            return cached.Names ?? new Dictionary<long, string>();
        }

        ProductCatalogue[serverUrl] = (DateTime.UtcNow, names);
        return names;
    }

    private static SyncResult Fail(SyncResult result, string message)
    {
        result.Success = false;
        result.Message = message;
        result.Errors.Add(message);
        result.EndTime = DateTimeOffset.UtcNow;
        return result;
    }
}
