export default async function handler(req, res) {
  // Basic CORS so Framer can call this safely
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const zip = (req.query.zip || "").toString().trim();
    const radiusMiles = Number(req.query.radius || 25);
    if (!zip) return res.status(400).json({ error: "Missing zip" });

    // 1️⃣ ZIP -> lat/lng (Google Geocoding API)
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${zip}&components=country:US&key=${process.env.GOOGLE_MAPS_KEY}`
    ).then(r => r.json());

    const loc = geoRes?.results?.[0]?.geometry?.location;
    if (!loc) return res.status(404).json({ error: "ZIP not found" });

    const { lat, lng } = loc;
    const radiusMeters = Math.round(radiusMiles * 1609.34);

    // 2️⃣ Search for videographers near the ZIP
    const searchRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=videographer OR video production service OR commercial photographer&location=${lat},${lng}&radius=${radiusMeters}&key=${process.env.GOOGLE_PLACES_KEY}`
    ).then(r => r.json());

    const details = await Promise.all(
      (searchRes.results || []).slice(0, 10).map(r =>
        fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${r.place_id}&fields=place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,geometry&key=${process.env.GOOGLE_PLACES_KEY}`
        ).then(x => x.json())
      )
    );

    // 3️⃣ Clean up the results
    const normalized = details
      .map(d => d.result)
      .filter(Boolean)
      .map(p => ({
        name: p.name,
        address: p.formatted_address,
        phone: p.formatted_phone_number,
        website: p.website,
        rating: p.rating,
        reviews: p.user_ratings_total,
      }));

    // 4️⃣ Send back to Framer
    res.status(200).json(normalized);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error", detail: e.message });
  }
}
