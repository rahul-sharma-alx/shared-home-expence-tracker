export function GET() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return Response.json(
    { date: `${year}-${month}-${day}` },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
