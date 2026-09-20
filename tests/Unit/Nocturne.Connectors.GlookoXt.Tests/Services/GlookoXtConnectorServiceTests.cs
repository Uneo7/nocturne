using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Nocturne.Connectors.Core.Interfaces;
using Nocturne.Connectors.Core.Models;
using Nocturne.Connectors.Core.Services;
using Nocturne.Connectors.GlookoXt.Configurations;
using Nocturne.Connectors.GlookoXt.Models;
using Nocturne.Connectors.GlookoXt.Services;
using Nocturne.Core.Contracts.Multitenancy;
using Nocturne.Core.Contracts.V4;
using Nocturne.Core.Models.V4;
using Xunit;

namespace Nocturne.Connectors.GlookoXt.Tests.Services;

public class GlookoXtConnectorServiceTests
{
    private static readonly string ValidToken =
        GlookoXtJwtTests.Token(DateTimeOffset.UtcNow.AddDays(300).ToUnixTimeSeconds());

    private static readonly string ExpiredToken =
        GlookoXtJwtTests.Token(DateTimeOffset.UtcNow.AddDays(-1).ToUnixTimeSeconds());

    [Fact]
    public async Task Sync_WithoutAStoredToken_FailsAndTellsTheTenantToConnect()
    {
        var fixture = new Fixture(accessToken: null);

        var result = await fixture.Service.SyncDataAsync(new SyncRequest(), fixture.Config, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Message.Should().Contain("not connected");
        fixture.DataClient.Connections.Should().Be(0);
    }

    [Fact]
    public async Task Sync_WithoutAToken_AsksTheOwnerToReconnect()
    {
        var fixture = new Fixture(accessToken: null);

        var result = await fixture.Service.SyncDataAsync(new SyncRequest(), fixture.Config, CancellationToken.None);

        result.Attention.Should().Be(ConnectorAttention.ReconnectRequired());
    }

    [Fact]
    public async Task Sync_WithATokenExpiringWithinTheNotice_SucceedsButWarnsWithTheDeadline()
    {
        var expiry = DateTimeOffset.UtcNow.AddDays(5);
        var fixture = new Fixture(accessToken: GlookoXtJwtTests.Token(expiry.ToUnixTimeSeconds()));

        var result = await fixture.Service.SyncDataAsync(
            new SyncRequest { From = DateTime.UtcNow.AddDays(-1), To = DateTime.UtcNow }, fixture.Config, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Attention.Should().NotBeNull();
        result.Attention!.Kind.Should().Be(ConnectorAttentionKind.ReconnectSoon);
        result.Attention.Deadline.Should().BeCloseTo(expiry.UtcDateTime, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Sync_WithALongLivedToken_AsksNothing()
    {
        var fixture = new Fixture(accessToken: ValidToken);

        var result = await fixture.Service.SyncDataAsync(
            new SyncRequest { From = DateTime.UtcNow.AddDays(-1), To = DateTime.UtcNow }, fixture.Config, CancellationToken.None);

        result.Attention.Should().BeNull();
    }

    [Fact]
    public async Task Sync_WhenTheServerRefusesTheToken_AsksTheOwnerToReconnect()
    {
        var fixture = new Fixture(accessToken: ValidToken);
        fixture.DataClient.ConnectFailure = new GlookoXtAuthenticationException("refused");

        var result = await fixture.Service.SyncDataAsync(
            new SyncRequest { From = DateTime.UtcNow.AddDays(-1), To = DateTime.UtcNow }, fixture.Config, CancellationToken.None);

        result.Attention.Should().Be(ConnectorAttention.ReconnectRequired());
    }

    [Fact]
    public async Task Sync_WithAnExpiredToken_FailsAndAsksForANewSignIn()
    {
        var fixture = new Fixture(accessToken: ExpiredToken);

        var result = await fixture.Service.SyncDataAsync(new SyncRequest(), fixture.Config, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Message.Should().Contain("expired");
        fixture.DataClient.Connections.Should().Be(0);
    }

    [Fact]
    public async Task Sync_OpensOneSession_ReadsInWeeklyChunks_AndPublishesEveryEnabledType()
    {
        var fixture = new Fixture(accessToken: ValidToken);
        var at = DateTime.UtcNow.AddDays(-3);
        fixture.DataClient.Records =
        [
            new GlookoXtRecord { Id = 1, RecordedAt = at.ToString("O"), GlycemiaCgm = 120 },
            new GlookoXtRecord { Id = 2, RecordedAt = at.ToString("O"), FastInsulin = 2.5, Carbs = 30 },
            new GlookoXtRecord { Id = 3, RecordedAt = at.ToString("O"), Note = "Long walk" },
        ];

        var from = DateTime.UtcNow.AddDays(-20);
        var to = DateTime.UtcNow;
        var result = await fixture.Service.SyncDataAsync(
            new SyncRequest { From = from, To = to }, fixture.Config, CancellationToken.None);

        result.Success.Should().BeTrue(string.Join("; ", result.Errors));
        fixture.DataClient.Connections.Should().Be(1);
        fixture.DataClient.Windows.Should().HaveCount(3, "twenty days read a week at a time is three windows");
        fixture.DataClient.Windows.First().From.Should().BeCloseTo(from, TimeSpan.FromSeconds(1));
        fixture.DataClient.Windows.Last().To.Should().BeCloseTo(to, TimeSpan.FromSeconds(1));

        result.ItemsSynced.Should().Contain(SyncDataType.Glucose, 1);
        result.ItemsSynced.Should().Contain(SyncDataType.Boluses, 1);
        result.ItemsSynced.Should().Contain(SyncDataType.CarbIntake, 1);
        result.ItemsSynced.Should().Contain(SyncDataType.Notes, 1);
        result.ItemsSynced.Should().Contain(SyncDataType.ManualBG, 0);

        fixture.Publisher.Verify(p => p.Glucose.PublishSensorGlucoseAsync(
            It.Is<IEnumerable<SensorGlucose>>(s => s.Count() == 1), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>()), Times.Once);
        fixture.Publisher.Verify(p => p.Treatments.PublishBolusesAsync(
            It.Is<IEnumerable<Bolus>>(b => b.Count() == 1), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>()), Times.Once);
        fixture.DataClient.Disposed.Should().BeTrue("the session closes with the sync");
    }

    [Fact]
    public async Task Sync_ReadsTheExportByFortnight_AndPublishesPumpModes()
    {
        var fixture = new Fixture(accessToken: ValidToken);
        var at = DateTime.UtcNow.AddDays(-2);
        fixture.DataClient.Export = new GlookoXtExport
        {
            TimeZoneId = "Europe/Paris",
            Rows = [new GlookoXtExportRow { TimestampUtc = at, Event = "pumpMode - Closed loop", DurationMs = 3_600_000, PumpDevice = "YpsoPump" }],
        };

        var now = DateTime.UtcNow;
        var result = await fixture.Service.SyncDataAsync(
            new SyncRequest { From = now.AddDays(-20), To = now }, fixture.Config, CancellationToken.None);

        result.Success.Should().BeTrue(string.Join("; ", result.Errors));
        fixture.DataClient.ExportWindows.Should().HaveCount(2, "twenty-two days of export a fortnight at a time is two calls");
        fixture.DataClient.ExportWindows.First().From.Should().Be(DateOnly.FromDateTime(now.AddDays(-21)));
        result.ItemsSynced.Should().Contain(SyncDataType.StateSpans, 1);
    }

    [Fact]
    public async Task Sync_OnAuto_TakesTheUnitTheAccountReports()
    {
        var fixture = new Fixture(accessToken: ValidToken);
        fixture.DataClient.Account = new GlookoXtAccount { BloodGlucoseUnit = "mmol/l", TimeZoneId = "Europe/Paris" };
        var at = DateTime.UtcNow.AddDays(-1);
        // 20 alone would read as mg/dL on the value heuristic; the account says mmol/L.
        fixture.DataClient.Records = [new GlookoXtRecord { Id = 1, RecordedAt = at.ToString("O"), GlycemiaCgm = 20 }];
        IEnumerable<SensorGlucose>? published = null;
        fixture.Publisher.Setup(p => p.Glucose.PublishSensorGlucoseAsync(It.IsAny<IEnumerable<SensorGlucose>>(), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>()))
            .Callback<IEnumerable<SensorGlucose>, string, WriteOrigin, CancellationToken>((s, _, _, _) => published = s.ToList()).ReturnsAsync(true);

        await fixture.Service.SyncDataAsync(new SyncRequest { From = at.AddHours(-1), To = DateTime.UtcNow }, fixture.Config, CancellationToken.None);

        published.Should().ContainSingle().Which.Mgdl.Should().Be(360);
    }

    [Fact]
    public async Task Sync_NarrowedToGlucose_SkipsTheExport()
    {
        var fixture = new Fixture(accessToken: ValidToken);

        await fixture.Service.SyncDataAsync(
            new SyncRequest { From = DateTime.UtcNow.AddDays(-1), To = DateTime.UtcNow, DataTypes = [SyncDataType.Glucose] },
            fixture.Config, CancellationToken.None);

        fixture.DataClient.ExportWindows.Should().BeEmpty();
    }

    [Fact]
    public async Task Sync_DedupesARecordTwoWindowsBothReturned()
    {
        var fixture = new Fixture(accessToken: ValidToken);
        var at = DateTime.UtcNow.AddDays(-7);
        fixture.DataClient.Records = [new GlookoXtRecord { Id = 9, RecordedAt = at.ToString("O"), Carbs = 12 }];

        var now = DateTime.UtcNow;
        var result = await fixture.Service.SyncDataAsync(
            new SyncRequest { From = now.AddDays(-14), To = now }, fixture.Config, CancellationToken.None);

        fixture.DataClient.Windows.Should().HaveCount(2);
        result.ItemsSynced.Should().Contain(SyncDataType.CarbIntake, 1);
    }

    [Fact]
    public async Task Sync_NarrowedToOneType_PublishesOnlyThatType()
    {
        var fixture = new Fixture(accessToken: ValidToken);
        var at = DateTime.UtcNow.AddDays(-1);
        fixture.DataClient.Records =
        [
            new GlookoXtRecord { Id = 1, RecordedAt = at.ToString("O"), GlycemiaCgm = 120, Carbs = 30 },
        ];

        var result = await fixture.Service.SyncDataAsync(
            new SyncRequest { From = at.AddHours(-1), To = DateTime.UtcNow, DataTypes = [SyncDataType.CarbIntake] },
            fixture.Config, CancellationToken.None);

        result.ItemsSynced.Keys.Should().BeEquivalentTo([SyncDataType.CarbIntake]);
        fixture.Publisher.Verify(p => p.Glucose.PublishSensorGlucoseAsync(
            It.IsAny<IEnumerable<SensorGlucose>>(), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Sync_WhenTheServerRefusesTheToken_FailsWithAReconnectMessage()
    {
        var fixture = new Fixture(accessToken: ValidToken);
        fixture.DataClient.ConnectFailure = new GlookoXtAuthenticationException("refused");

        var result = await fixture.Service.SyncDataAsync(
            new SyncRequest { From = DateTime.UtcNow.AddDays(-1), To = DateTime.UtcNow }, fixture.Config, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Message.Should().Contain("sign in again");
    }

    [Fact]
    public async Task Sync_WithNoStoredData_StartsAtTheInitialFloor()
    {
        var fixture = new Fixture(accessToken: ValidToken);

        await fixture.Service.SyncDataAsync(new SyncRequest(), fixture.Config, CancellationToken.None);

        fixture.DataClient.Windows.First().From.Should().BeCloseTo(DateTime.UtcNow.AddMonths(-6) - GlookoXtConstants.ResumeOverlap, TimeSpan.FromMinutes(1));
        fixture.DataClient.Windows.Last().To.Should().BeAfter(DateTime.UtcNow, "an hour of slack past now catches entries typed ahead of the server clock");
    }

    [Fact]
    public async Task Sync_ResumesFromTheOlderOfTheGlucoseAndTreatmentWatermarks()
    {
        var fixture = new Fixture(accessToken: ValidToken);
        var glucoseLatest = DateTime.UtcNow.AddHours(-2);
        var treatmentLatest = DateTime.UtcNow.AddDays(-2);
        fixture.Publisher.Setup(p => p.Glucose.GetLatestEntryTimestampAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(glucoseLatest);
        fixture.Publisher.Setup(p => p.Treatments.GetLatestTreatmentTimestampAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(treatmentLatest);

        await fixture.Service.SyncDataAsync(new SyncRequest(), fixture.Config, CancellationToken.None);

        fixture.DataClient.Windows.First().From.Should().BeCloseTo(treatmentLatest - GlookoXtConstants.ResumeOverlap, TimeSpan.FromMinutes(10),
            "the read serves every family, so it starts where the slowest one left off, less the overlap that closes the last open basal");
    }

    private sealed class FakeDataClient : IGlookoXtDataClient, IGlookoXtSession
    {
        public List<GlookoXtRecord> Records { get; set; } = [];
        public List<(DateTime From, DateTime To)> Windows { get; } = [];
        public int Connections { get; private set; }
        public bool Disposed { get; private set; }
        public Exception? ConnectFailure { get; set; }

        public Task<IGlookoXtSession> ConnectAsync(string serverUrl, string token, CancellationToken ct)
        {
            Connections++;
            if (ConnectFailure is not null) throw ConnectFailure;
            return Task.FromResult<IGlookoXtSession>(this);
        }

        public Task<IReadOnlyList<GlookoXtRecord>> GetCollectedDataAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct)
        {
            Windows.Add((fromUtc, toUtc));
            IReadOnlyList<GlookoXtRecord> inWindow = Records
                .Where(r => DateTime.Parse(r.RecordedAt!, null, System.Globalization.DateTimeStyles.AdjustToUniversal) is var at
                            && at >= fromUtc.AddDays(-1) && at <= toUtc.AddDays(1))
                .ToList();
            return Task.FromResult(inWindow);
        }

        public Task<IReadOnlyList<GlookoXtProduct>> GetProductsAsync(string productType, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<GlookoXtProduct>>(productType == "pump"
                ? [new GlookoXtProduct { Id = 97, Name = "Ypsomed YpsoPump" }]
                : []);

        public List<(DateOnly From, DateOnly To)> ExportWindows { get; } = [];
        public GlookoXtExport Export { get; set; } = new();

        public GlookoXtAccount? Account { get; set; }

        public Task<GlookoXtAccount?> GetAccountAsync(CancellationToken ct) => Task.FromResult(Account);

        public Task<GlookoXtExport> ExportRecordsAsync(DateOnly firstDay, DateOnly lastDay, CancellationToken ct)
        {
            ExportWindows.Add((firstDay, lastDay));
            return Task.FromResult(Export);
        }

        public ValueTask DisposeAsync()
        {
            Disposed = true;
            return ValueTask.CompletedTask;
        }
    }

    private sealed class Fixture
    {
        public GlookoXtConnectorConfiguration Config { get; }
        public GlookoXtConnectorService Service { get; }
        public FakeDataClient DataClient { get; } = new();
        public Mock<IConnectorPublisher> Publisher { get; } = new();

        public Fixture(string? accessToken)
        {
            Config = new GlookoXtConnectorConfiguration { Email = "patient@example.com", AccessToken = accessToken };

            Publisher.Setup(p => p.IsAvailable).Returns(true);
            Publisher.Setup(p => p.Glucose.PublishSensorGlucoseAsync(It.IsAny<IEnumerable<SensorGlucose>>(), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
            Publisher.Setup(p => p.Treatments.PublishBolusesAsync(It.IsAny<IEnumerable<Bolus>>(), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
            Publisher.Setup(p => p.Treatments.PublishCarbIntakesAsync(It.IsAny<IEnumerable<CarbIntake>>(), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
            Publisher.Setup(p => p.Treatments.PublishBGChecksAsync(It.IsAny<IEnumerable<BGCheck>>(), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
            Publisher.Setup(p => p.Treatments.PublishTempBasalsAsync(It.IsAny<IEnumerable<TempBasal>>(), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
            Publisher.Setup(p => p.Treatments.PublishBasalInjectionsAsync(It.IsAny<IEnumerable<BasalInjection>>(), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
            Publisher.Setup(p => p.Device.PublishDeviceEventsAsync(It.IsAny<IEnumerable<DeviceEvent>>(), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
            Publisher.Setup(p => p.Metadata.PublishNotesAsync(It.IsAny<IEnumerable<Note>>(), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
            Publisher.Setup(p => p.Metadata.PublishStateSpansAsync(It.IsAny<IEnumerable<Nocturne.Core.Models.StateSpan>>(), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
            Publisher.Setup(p => p.Metadata.PublishProfilesAsync(It.IsAny<IEnumerable<Nocturne.Core.Models.Profile>>(), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
            Publisher.Setup(p => p.Metadata.PublishSystemEventsAsync(It.IsAny<IEnumerable<Nocturne.Core.Models.SystemEvent>>(), It.IsAny<string>(), It.IsAny<WriteOrigin>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
            Publisher.Setup(p => p.Glucose.GetLatestEntryTimestampAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((DateTime?)null);
            Publisher.Setup(p => p.Treatments.GetLatestTreatmentTimestampAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((DateTime?)null);

            var resolver = new ConnectorServerResolver<GlookoXtConnectorConfiguration>(null, null, GlookoXtConstants.ServerUrl);
            var tenant = new Mock<ITenantAccessor>();
            tenant.Setup(t => t.IsResolved).Returns(true);
            tenant.Setup(t => t.TenantId).Returns(Guid.NewGuid());

            var tokenProvider = new GlookoXtAuthTokenProvider(
                new HttpClient(), new ConnectorTokenCache(), resolver, tenant.Object,
                NullLogger<GlookoXtAuthTokenProvider>.Instance);

            Service = new GlookoXtConnectorService(
                new HttpClient(), resolver, NullLogger<GlookoXtConnectorService>.Instance,
                tokenProvider, DataClient, Publisher.Object);
        }
    }
}
