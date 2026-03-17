// API handler for search term generation
// This acts as a proxy to the Cloudflare Worker

const WORKER_URL = "https://search-term-generator.danish-us-salam.workers.dev";

export default async function handler(request) {
  if (request.method === "POST") {
    try {
      const body = await request.json();

      const response = await fetch(WORKER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return {
          statusCode: response.status,
          body: JSON.stringify({ error: "Worker request failed" }),
        };
      }

      const data = await response.json();
      return {
        statusCode: 200,
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
      };
    }
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ error: "Method not allowed" }),
  };
}
