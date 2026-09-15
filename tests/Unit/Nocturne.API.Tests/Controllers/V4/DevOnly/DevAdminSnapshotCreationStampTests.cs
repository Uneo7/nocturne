using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Nocturne.API.Controllers.V4.DevOnly;
using Nocturne.API.Models.DevOnly;
using Nocturne.API.Services.Connectors;
using Nocturne.Core.Contracts.Auth;
using Nocturne.Core.Contracts.Connectors;
using Nocturne.Core.Contracts.Multitenancy;
using Nocturne.Infrastructure.Data;
using Nocturne.Infrastructure.Data.Entities;
using Nocturne.Tests.Shared.Infrastructure;
using Xunit;

namespace Nocturne.API.Tests.Controllers.V4.DevOnly;

/// <summary>
/// Creation stamps are server-assigned, so a snapshot restore cannot carry an original one in —
/// neither through the insert branch nor by rewriting the row a matching tenant already has.
/// </summary>
public class DevAdminSnapshotCreationStampTests : IDisposable
{
    private static readonly DateTime Stale = new(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly SqliteTestDatabase _database = TestDbContextFactory.CreateSqlite();

    [Fact]
    public async Task ImportSnapshot_LeavesTheServerAssignedCreationStampAlone()
    {
        var existingId = Guid.CreateVersion7();
        var restoredId = Guid.CreateVersion7();
        var before = DateTime.UtcNow;

        await using (var seed = _database.CreateContext())
        {
            seed.Tenants.Add(new TenantEntity
            {
                Id = existingId,
                Slug = "existing",
                DisplayName = "Existing",
                IsActive = true,
            });
            await seed.SaveChangesAsync();
        }

        DateTime stampedOnInsert;
        await using (var read = _database.CreateContext())
        {
            stampedOnInsert = (await read.Tenants.SingleAsync(t => t.Id == existingId)).SysCreatedAt;
        }

        await using (var context = _database.CreateContext())
        {
            var result = await NewController(context).ImportSnapshot(
                new DevSnapshotDto
                {
                    Tenants =
                    [
                        SnapshotOf(existingId, "existing"),
                        SnapshotOf(restoredId, "restored"),
                    ],
                },
                CancellationToken.None);

            result.Should().BeOfType<OkObjectResult>();
        }

        await using var verify = _database.CreateContext();

        var existing = await verify.Tenants.SingleAsync(t => t.Id == existingId);
        existing.SysCreatedAt.Should().Be(stampedOnInsert,
            "a restore over an existing tenant does not adopt the snapshot's creation stamp");

        var restored = await verify.Tenants.SingleAsync(t => t.Id == restoredId);
        restored.SysCreatedAt.Should().BeOnOrAfter(before,
            "a restored tenant is stamped with the restore time, not the snapshot's");
    }

    private DevAdminController NewController(NocturneDbContext context) =>
        new(
            context,
            Mock.Of<ISecretEncryptionService>(),
            Mock.Of<IConnectorSyncService>(),
            Mock.Of<ITenantAccessor>(),
            Mock.Of<ITenantService>(),
            new MemoryCache(new MemoryCacheOptions()),
            NullLogger<DevAdminController>.Instance);

    private static TenantSnapshotDto SnapshotOf(Guid id, string slug) =>
        new()
        {
            Tenant = new TenantEntityDto
            {
                Id = id,
                Slug = slug,
                DisplayName = slug,
                IsActive = true,
                SysCreatedAt = Stale,
                SysUpdatedAt = Stale,
            },
        };

    public void Dispose() => _database.Dispose();
}
