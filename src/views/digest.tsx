import type { NightDigest } from '../digest/types.js';

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      <p class="mute">
        {digest.badLines} malformed {digest.badLines === 1 ? 'line' : 'lines'}
      </p>
      {digest.rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <div class="table-scroll" role="region" aria-label={`Digest for ${digest.night}`} tabIndex={0}>
          <table class="digest-table">
            <thead>
              <tr>
                <th scope="col">job</th>
                <th scope="col">owner</th>
                <th scope="col">runs</th>
                <th scope="col">retries</th>
                <th scope="col">last status</th>
                <th scope="col">last error</th>
                <th scope="col">first time</th>
                <th scope="col">last time</th>
              </tr>
            </thead>
            <tbody>
              {digest.rows.map((row) => (
                <tr>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td>
                    {row.retries}
                    {row.retries >= 3 && <span class="warn"> · 3 or more</span>}
                  </td>
                  <td>
                    {row.lastStatus}
                    {row.hasFailure && <span class="warn"> · failed at least once</span>}
                  </td>
                  <td class="digest-error">{row.lastError ?? '—'}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
