import express from 'express';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import 'dotenv/config';

const app = express();
const PORT = 3000;

// Initialize the Grok client using the OpenAI SDK compatibility [2][6]
const grok = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: 'https://api.x.ai/v1',
});

// Sample list of cities with coordinates
const cities = [
    { name: "Toronto", lat: 43.6532, lon: -79.3832 },
    { name: "Tokyo", lat: 35.6895, lon: 139.6917 },
    { name: "London", lat: 51.5074, lon: -0.1278 },
    { name: "Paris", lat: 48.8566, lon: 2.3522 },
    { name: "New York", lat: 40.7128, lon: -74.0060 },
    { name: "Sydney", lat: -33.8688, lon: 151.2093 },
    { name: "Cairo", lat: 30.0444, lon: 31.2357 },
    { name: "Iceland", lat: 65, lon: 19 }
];

// Helper to interpret weather codes
function getWeatherDescription(code) {
    const descriptions = { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 80: 'Slight rain showers', 95: 'Thunderstorm' };
    return descriptions[code] || 'Unknown weather';
}

// Setup view engine and middleware
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

// --- ROUTES ---

// Render the initial form
app.get('/', (req, res) => {
    res.render('index', { 
        cities, 
        weather: null, 
        grokResponse: null, 
        error: null,
        selectedCity: cities[0].name,
        prompt: `Based on current weather in the selected city, advise on 3 fun things I can do there.`
    });
});

// Handle the RAG process on form submission
app.post('/get-recommendations', async (req, res) => {
    const { city: selectedCityName, prompt: userPrompt } = req.body;
    const city = cities.find(c => c.name === selectedCityName);
    let weatherData = null;
    let grokResponse = null;
    let error = null;

    if (!city) {
        error = 'City not found.';
        return res.render('index', { cities, weather: null, grokResponse: null, error, selectedCity: cities[0].name, prompt: userPrompt });
    }

    try {
        // STEP 1: RETRIEVE - Get current weather from Open-Meteo
        const weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code&timezone=auto`;
        const weatherResponse = await fetch(weatherApiUrl);
        if (!weatherResponse.ok) throw new Error('Failed to retrieve weather data.');
        const data = await weatherResponse.json();
        
        weatherData = {
            temperature: data.current.temperature_2m,
            unit: data.current_units.temperature_2m,
            description: getWeatherDescription(data.current.weather_code)
        };

        // STEP 2: AUGMENT - Create a detailed prompt for Grok
        const augmentedPrompt = `Based on the following real-time weather conditions in ${city.name}:
- Temperature: ${weatherData.temperature}°${weatherData.unit}
- Condition: ${weatherData.description}

Now, please thoughtfully answer my request: "${userPrompt}"`;

        // STEP 3: GENERATE - Send the augmented prompt to Grok [3]
        const chatCompletion = await grok.chat.completions.create({
            model: 'grok-3-beta', 
            messages: [
                { role: 'system', content: 'You are a witty and helpful travel assistant. You provide creative and practical suggestions based on the weather context provided.' },
                { role: 'user', content: augmentedPrompt }
            ],
            temperature: 0.7,
        });
        grokResponse = chatCompletion.choices[0].message.content;

    } catch (err) {
        console.error(err);
        error = `An error occurred: ${err.message}`;
    }

    // STEP 4: DISPLAY - Render the page with all the retrieved and generated data
    res.render('index', { cities, weather: weatherData, grokResponse, error, selectedCity: city.name, prompt: userPrompt });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});