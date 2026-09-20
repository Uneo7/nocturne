namespace Nocturne.Connectors.GlookoXt.Configurations;

/// <summary>
///     Wire constants of the Glooko XT (formerly Diabnext) patient API, reconstructed from the
///     Android app. The REST endpoints only sign a patient in; every data exchange happens over
///     Socket.IO events against the same host.
/// </summary>
public static class GlookoXtConstants
{
    /// <summary>REST and Socket.IO share this host; the web front end at my.glookoxt.com rejects API calls.</summary>
    public const string ServerUrl = "https://srv.glookoxt.com";

    /// <summary>
    ///     The app sends this header on every sign-in request; the server rejects a request
    ///     without it.
    /// </summary>
    public const string AbTokenHeader = "x-ab-token";

    public static class Endpoints
    {
        /// <summary>Step one of the sign-in: checks the password and emails a one-time code.</summary>
        public const string PatientLogin = "/api/users/patient-login/";

        /// <summary>Step two of the sign-in: trades the emailed code for a long-lived JWT.</summary>
        public const string CodeAuth = "/api/users/code-auth";
    }

    public static class Events
    {
        /// <summary>Read API: <c>{ start_time, end_time }</c> (ISO-8601 UTC) answers <c>{ collected_data: [...] }</c>.</summary>
        public const string GetCollectedData = "GET_COLLECTED_DATA";

        /// <summary>Device catalogue: <c>{ product_type }</c> answers <c>{ brands: [{ name, products: [{ id, name }] }] }</c>.</summary>
        public const string GetProducts = "GET_PRODUCTS";

        /// <summary>The signed-in patient's profile; only the glucose unit and zone are read from it.</summary>
        public const string GetUserData = "GET_USER_DATA";

        /// <summary>CSV export: <c>{ start_date, end_date }</c> (<c>yyyy-MM-dd</c>) answers <c>{ export: "<csv>" }</c>.</summary>
        public const string ExportRecords = "EXPORT_RECORDS";
    }

    /// <summary>The account-unit switch values a tenant can pick.</summary>
    public static class GlucoseUnits
    {
        public const string Auto = "Auto";
        public const string MgDl = "mgdl";
        public const string Mmol = "mmol";
    }

    /// <summary>
    ///     A day of a pumping patient is a few hundred records; a week keeps each Socket.IO answer
    ///     comfortably small while a six-month backfill stays under thirty round trips.
    /// </summary>
    public static readonly TimeSpan FetchChunk = TimeSpan.FromDays(7);

    /// <summary>
    ///     How long one Socket.IO request, or the handshake, may wait. The handshake has been seen
    ///     to take twenty-odd seconds on a slow day; a minute keeps that from reading as a refusal.
    /// </summary>
    public static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(60);

    /// <summary>
    ///     How far behind the resume point a sync starts reading. A synced pump reports its basal as
    ///     a stream of rate changes, each open until the next; the last one a sync saw was left
    ///     open, and only re-reading it beside its successor closes it.
    /// </summary>
    public static readonly TimeSpan ResumeOverlap = TimeSpan.FromHours(3);

    /// <summary>
    ///     The export is one CSV line per record and a fortnight of a pumping patient is some
    ///     twenty thousand lines; longer and the answer grows past what one acknowledgement
    ///     should carry.
    /// </summary>
    public static readonly TimeSpan ExportChunk = TimeSpan.FromDays(14);

    /// <summary>
    ///     How far ahead of the token's expiry the tenant is told to sign in again. The sign-in
    ///     needs them at their email, so a fortnight gives a holiday's worth of notice.
    /// </summary>
    public static readonly TimeSpan ReconnectNotice = TimeSpan.FromDays(14);
}
