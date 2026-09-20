using Nocturne.Connectors.Core.Models;
using Nocturne.Connectors.Core.Services;
using Nocturne.Connectors.GlookoXt.Configurations;

namespace Nocturne.Connectors.GlookoXt.Services;

/// <summary>
///     "Test connection" for Glooko XT. There is no password to test — the emailed code makes the
///     sign-in interactive — so this checks the stored token is present, unexpired and accepted
///     by the server for a real session, which is what the next sync will need of it.
/// </summary>
public class GlookoXtCredentialVerifier(IGlookoXtDataClient dataClient)
    : ConnectorCredentialVerifier<GlookoXtConnectorConfiguration>
{
    public override string ConnectorId => "glookoxt";

    protected override async Task<ConnectorCredentialVerificationResult> VerifyConfiguredAsync(
        GlookoXtConnectorConfiguration config, CancellationToken ct)
    {
        var token = config.AccessToken?.Trim();
        if (string.IsNullOrEmpty(token))
            return ConnectorCredentialVerificationResult.Failed(
                "Glooko XT is not connected yet. Use \"Connect Glooko XT\" to sign in with the emailed code.");

        if (GlookoXtJwt.TryGetExpiry(token) is { } expiry && expiry <= DateTime.UtcNow)
            return ConnectorCredentialVerificationResult.Failed(
                "The Glooko XT sign-in has expired. Sign in again with a new emailed code.");

        try
        {
            await using var session = await dataClient.ConnectAsync(GlookoXtConstants.ServerUrl, token, ct);
            var now = DateTime.UtcNow;
            await session.GetCollectedDataAsync(now.AddMinutes(-5), now, ct);
            return ConnectorCredentialVerificationResult.Verified();
        }
        catch (GlookoXtAuthenticationException ex)
        {
            return ConnectorCredentialVerificationResult.Failed(ex.Message);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return ConnectorCredentialVerificationResult.Failed($"Glooko XT could not be reached: {ex.Message}");
        }
    }
}
