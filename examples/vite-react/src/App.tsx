function Hero() {
  return (
    <section style={{ padding: 40 }}>
      <h1 id="hero-heading">Vite + React go brrrr</h1>
      <p id="hero-para">Edit me via pinpoint.</p>
      <button
        id="hero-btn"
        type="button"
        style={{
          backgroundColor: "#6366f1",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "8px 16px",
          cursor: "pointer",
        }}
      >
        A button
      </button>
    </section>
  );
}

export default function App() {
  return <Hero />;
}
