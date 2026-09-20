using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Nocturne.Connectors.Core.Extensions;
using Nocturne.Connectors.Core.Services;
using Nocturne.Connectors.GlookoXt.Configurations;
using Nocturne.Connectors.GlookoXt.Services;

namespace Nocturne.Connectors.GlookoXt;

public class GlookoXtConnectorInstaller()
    : ConnectorInstaller<GlookoXtConnectorConfiguration, GlookoXtConnectorService, GlookoXtAuthTokenProvider>(
        new ConnectorOptions
        {
            ConnectorName = "GlookoXt",
            DefaultServer = GlookoXtConstants.ServerUrl,
            Timeout = TimeSpan.FromSeconds(30),
            ConnectTimeout = TimeSpan.FromSeconds(15),
            AddResilience = true,
        })
{
    /// <inheritdoc />
    protected override void InstallAdditional(IServiceCollection services, GlookoXtConnectorConfiguration config)
    {
        services.TryAddSingleton<IGlookoXtDataClient, GlookoXtSocketDataClient>();
        services.AddConnectorCredentialVerifier<GlookoXtCredentialVerifier>();

        // The connect controller's sign-in client. Same outbound guard as every connector client.
        services.AddHttpClient<GlookoXtLoginClient>()
            .ConfigureConnectorClient(
                null,
                timeout: TimeSpan.FromSeconds(30),
                connectTimeout: TimeSpan.FromSeconds(15),
                addResilience: true);
    }
}
