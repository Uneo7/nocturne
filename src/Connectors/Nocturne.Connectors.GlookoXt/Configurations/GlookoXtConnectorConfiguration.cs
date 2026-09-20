using Nocturne.Connectors.Core.Extensions;
using Nocturne.Connectors.Core.Models;
using Nocturne.Core.Constants;

namespace Nocturne.Connectors.GlookoXt.Configurations;

[ConnectorRegistration(
    "GlookoXt",
    ServiceNames.GlookoXtConnector,
    "GLOOKOXT",
    nameof(ConnectSource.GlookoXt),
    DataSources.GlookoXtConnector,
    "glookoxt",
    ConnectorCategory.Sync,
    "Import glucose, insulin, carbs and pump events from a Glooko XT (formerly Diabnext) patient account",
    "Glooko XT",
    SupportsHistoricalSync = true,
    MaxHistoricalDays = 0,
    SupportsManualSync = true,
    SupportedDataTypes =
    [
        SyncDataType.Glucose,
        SyncDataType.ManualBG,
        SyncDataType.Boluses,
        SyncDataType.BolusCalculations,
        SyncDataType.BasalInjections,
        SyncDataType.CarbIntake,
        SyncDataType.TempBasals,
        SyncDataType.DeviceEvents,
        SyncDataType.StateSpans,
        SyncDataType.Profiles,
        SyncDataType.Notes,
    ],
    DefaultActiveThresholdMinutes = 180,
    DefaultStaleThresholdMinutes = 360
)]
public class GlookoXtConnectorConfiguration : BaseConnectorConfiguration
{
    public GlookoXtConnectorConfiguration()
    {
        ConnectSource = ConnectSource.GlookoXt;
        SyncIntervalMinutes = 15;
    }

    /// <summary>
    ///     The Glooko XT patient account's email. Needed to request and redeem the emailed
    ///     sign-in code, and recorded so the tenant can see which account is connected.
    /// </summary>
    [ConnectorProperty(ConnectorPropertyKey.Email, Required = true, Format = "email")]
    public string Email { get; init; } = string.Empty;

    /// <summary>
    ///     The account password. Only used to trigger the emailed code; the sync itself runs on
    ///     <see cref="AccessToken"/>.
    /// </summary>
    [ConnectorProperty(ConnectorPropertyKey.Password, Secret = true)]
    public string? Password { get; init; }

    /// <summary>
    ///     The JWT the sign-in code was traded for. Glooko XT issues it for about a year; the
    ///     connect flow stores it here and the sync presents it on every Socket.IO handshake.
    /// </summary>
    [ConnectorProperty(ConnectorPropertyKey.AccessToken, Secret = true, Hidden = true)]
    public string? AccessToken { get; init; }

    /// <summary>
    ///     The unit the Glooko XT account displays glucose in. A record carries a bare number in
    ///     the account's unit and nothing says which, so a wrong pick misreads every value by a
    ///     factor of eighteen. <c>Auto</c> infers it from the values themselves.
    /// </summary>
    [ConnectorProperty(ConnectorPropertyKey.GlucoseUnit, DefaultValue = GlookoXtConstants.GlucoseUnits.Auto,
        AllowedValues = [GlookoXtConstants.GlucoseUnits.Auto, GlookoXtConstants.GlucoseUnits.MgDl, GlookoXtConstants.GlucoseUnits.Mmol])]
    public string GlucoseUnit { get; init; } = GlookoXtConstants.GlucoseUnits.Auto;
}
