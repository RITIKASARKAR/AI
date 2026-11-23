const geocode = async (city) => {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not contact the weather location service.");
  const data = await response.json();
  const place = data.results?.[0];

  if (!place) throw new Error(`I couldn't find a location matching "${city}".`);
  return place;
};

async function getWeather({ city, date }) {
  if (!city || typeof city !== "string") {
    throw new Error("A destination city is required.");
  }

  const place = await geocode(city);
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", place.latitude);
  url.searchParams.set("longitude", place.longitude);
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "7");

  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not retrieve the weather forecast.");
  const data = await response.json();

  const forecast = (data.daily?.time || []).map((day, index) => ({
    date: day,
    maxC: data.daily.temperature_2m_max?.[index],
    minC: data.daily.temperature_2m_min?.[index],
    precipitationProbability: data.daily.precipitation_probability_max?.[index],
    weatherCode: data.daily.weather_code?.[index]
  }));

  return {
    location: `${place.name}, ${place.country}`,
    requestedDate: date || null,
    timezone: data.timezone,
    forecast,
    note: "This is a near-term forecast, not a long-range prediction. Forecast availability is limited to the next 7 days."
  };
}

function calculateBudget({ totalBudget, currency = "INR", travelers = 1, days = 1 }) {
  const amount = Number(totalBudget);
  const people = Number(travelers);
  const tripDays = Number(days);

  if (!Number.isFinite(amount) || amount <= 0) throw new Error("totalBudget must be a positive number.");
  if (!Number.isInteger(people) || people < 1 || people > 20) throw new Error("travelers must be between 1 and 20.");
  if (!Number.isInteger(tripDays) || tripDays < 1 || tripDays > 60) throw new Error("days must be between 1 and 60.");

  const allocation = {
    accommodation: 0.35,
    food: 0.25,
    localTransport: 0.20,
    activities: 0.15,
    emergencyBuffer: 0.05
  };

  const breakdown = Object.entries(allocation).map(([category, share]) => ({
    category,
    percentage: share * 100,
    amount: Math.round(amount * share * 100) / 100
  }));

  return {
    totalBudget: amount,
    currency,
    travelers: people,
    days: tripDays,
    perPerson: Math.round((amount / people) * 100) / 100,
    perPersonPerDay: Math.round((amount / people / tripDays) * 100) / 100,
    breakdown,
    note: "This is a planning allocation of the budget you supplied, not a quote or live price check."
  };
}

function createItinerary({ destination, days, interests = [], pace = "balanced" }) {
  const count = Number(days);
  if (!destination || typeof destination !== "string") throw new Error("A destination is required.");
  if (!Number.isInteger(count) || count < 1 || count > 14) {
    throw new Error("Itinerary duration must be between 1 and 14 days.");
  }

  const normalizedInterests = Array.isArray(interests)
    ? interests.filter((item) => typeof item === "string").slice(0, 8)
    : [];

  const slots = pace === "relaxed"
    ? ["One main activity", "Leisure / nearby exploration", "Dinner and rest"]
    : pace === "packed"
      ? ["Morning sightseeing", "Afternoon activity", "Evening experience"]
      : ["Morning activity", "Afternoon exploration", "Evening at leisure"];

  return {
    destination,
    days: Array.from({ length: count }, (_, index) => ({
      day: index + 1,
      morning: slots[0],
      afternoon: slots[1],
      evening: slots[2],
      interestsToPrioritize: normalizedInterests
    })),
    pace,
    note: "This is a schedule framework. The AI should fill it with suitable places and explain that opening hours and ticket availability need verification."
  };
}

export const travelTools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the near-term weather forecast for a destination city. Use when weather is relevant to the trip.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "Destination city, for example Jaipur or Singapore." },
          date: { type: "string", description: "Optional travel date in YYYY-MM-DD format." }
        },
        required: ["city"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_budget",
      description: "Split a traveler's total budget into accommodation, food, local transport, activities, and emergency buffer. It does not fetch real prices.",
      parameters: {
        type: "object",
        properties: {
          totalBudget: { type: "number", description: "Total budget supplied by the user." },
          currency: { type: "string", description: "Currency code such as INR, USD, or EUR." },
          travelers: { type: "integer", description: "Number of travelers." },
          days: { type: "integer", description: "Number of trip days." }
        },
        required: ["totalBudget", "travelers", "days"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_itinerary",
      description: "Create a day-by-day schedule framework based on destination, duration, interests, and pace.",
      parameters: {
        type: "object",
        properties: {
          destination: { type: "string" },
          days: { type: "integer" },
          interests: { type: "array", items: { type: "string" } },
          pace: { type: "string", enum: ["relaxed", "balanced", "packed"] }
        },
        required: ["destination", "days"],
        additionalProperties: false
      }
    }
  }
];

export async function executeTravelTool(name, args) {
  switch (name) {
    case "get_weather":
      return getWeather(args);
    case "calculate_budget":
      return calculateBudget(args);
    case "create_itinerary":
      return createItinerary(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}