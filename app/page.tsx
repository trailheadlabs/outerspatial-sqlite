export default function Home() {
  return (
    <main>
      <h1>OuterSpatial SQLite Export Service</h1>
      <p>API endpoints:</p>
      <ul>
        <li>POST /api/export/sqlite/all - Generate SQLite databases for all communities</li>
        <li>POST /api/export/sqlite/one - Generate SQLite database for a specific community</li>
        <li>GET /api/export/sqlite/list - List all available SQLite databases</li>
      </ul>
    </main>
  );
}