import type { ReadNightResult } from '../digest/types.js';

type FoundDigest = Extract<ReadNightResult, { kind: 'found' }>;

export function DigestPage(props: { digest: FoundDigest }) {
  const { digest } = props;

  return (
    <section>
      <h1>Digest · {digest.night}</h1>
      {digest.badLines > 0 ? (
        <p class="warn">{digest.badLines} malformed {digest.badLines === 1 ? 'line' : 'lines'} in the run log.</p>
      ) : null}
      {digest.rows.length === 0 ? (
        <p>Nothing ran this night.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Owner</th>
              <th>Runs</th>
              <th>Retries</th>
              <th>Last status</th>
              <th>Last error</th>
              <th>First time</th>
              <th>Last time</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr class={row.retries >= 3 || row.failures > 0 ? 'warn' : undefined}>
                <td>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td>{row.retries}</td>
                <td>{row.lastStatus}</td>
                <td>{row.lastError ?? '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
