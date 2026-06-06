'use client';

export default function ClientTest() {
  return (
    <main style={{ padding: 40 }}>
      <h1 id="ct-heading">Client component heading</h1>
      <p id="ct-para">Edit me via frontman-flow.</p>
      <button id="ct-btn" onClick={() => alert('hi')}>
        A button
      </button>
    </main>
  );
}
