using Microsoft.Extensions.Logging;
using Nocturne.Connectors.Core.Interfaces;
using Nocturne.Connectors.Core.Services;
using Nocturne.Connectors.GlookoXt.Configurations;
using Nocturne.Core.Contracts.Multitenancy;

namespace Nocturne.Connectors.GlookoXt.Services;

/// <summary>
///     Hands out the JWT the connect flow stored as <see cref="GlookoXtConnectorConfiguration.AccessToken"/>.
///     Nothing is acquired here: Glooko XT signs a patient in with a code it emails them, which no
///     background job can read, so an absent or lapsed token is answered with null and the sync
///     tells the tenant to reconnect.
/// </summary>
public class GlookoXtAuthTokenProvider(
    HttpClient httpClient,
    IConnectorTokenCache tokenCache,
    IConnectorServerResolver<GlookoXtConnectorConfiguration> serverResolver,
    ITenantAccessor tenantAccessor,
    ILogger<GlookoXtAuthTokenProvider> logger)
    : AuthTokenProviderBase<GlookoXtConnectorConfiguration>(httpClient, tokenCache, serverResolver, tenantAccessor, logger)
{
    /// <summary>
    ///     A token without an <c>exp</c> claim is re-read from the configuration this often, so a
    ///     tenant who reconnects is picked up without waiting a year.
    /// </summary>
    private static readonly TimeSpan UnknownExpiryLifetime = TimeSpan.FromHours(6);

    protected override string ConnectorName => "GlookoXt";

    protected override int TokenLifetimeBufferMinutes => 60;

    /// <summary>Why the last <see cref="AcquireTokenAsync"/> answered null, worded for the tenant's sync card.</summary>
    public string? LastFailure { get; private set; }

    protected override Task<(string? Token, DateTime ExpiresAt, IReadOnlyDictionary<string, string>? Metadata)> AcquireTokenAsync(
        GlookoXtConnectorConfiguration config, CancellationToken cancellationToken)
    {
        var token = config.AccessToken?.Trim();

        if (string.IsNullOrEmpty(token))
        {
            LastFailure = "Glooko XT is not connected yet. Open the connector settings and sign in with the code Glooko XT emails you.";
            _logger.LogInformation("Glooko XT has no stored access token for this tenant");
            return Task.FromResult<(string?, DateTime, IReadOnlyDictionary<string, string>?)>((null, DateTime.MinValue, null));
        }

        var expiry = GlookoXtJwt.TryGetExpiry(token);
        var now = DateTime.UtcNow;

        if (expiry is not null && expiry <= now.AddMinutes(TokenLifetimeBufferMinutes))
        {
            LastFailure = "The Glooko XT sign-in has expired. Open the connector settings and sign in again with a new emailed code.";
            _logger.LogInformation("Glooko XT access token expired at {ExpiresAt:O}", expiry);
            return Task.FromResult<(string?, DateTime, IReadOnlyDictionary<string, string>?)>((null, DateTime.MinValue, null));
        }

        LastFailure = null;
        var expiresAt = expiry ?? now + UnknownExpiryLifetime;
        _logger.LogDebug("Glooko XT access token accepted, valid until {ExpiresAt:O}", expiresAt);
        return Task.FromResult<(string?, DateTime, IReadOnlyDictionary<string, string>?)>((token, expiresAt, null));
    }
}
