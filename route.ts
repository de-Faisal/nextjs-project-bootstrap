import { NextResponse } from 'next/server';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FETCH_TIMEOUT = process.env.FETCH_TIMEOUT ? parseInt(process.env.FETCH_TIMEOUT) : 10000; // 10 seconds timeout, configurable via env

async function fetchWithTimeout(resource: RequestInfo, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = FETCH_TIMEOUT } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal  
  });
  clearTimeout(id);
  return response;
}

export async function POST(request: Request) {
  console.log('Received request to /api/chat');

  // Validate API key presence early
  if (!OPENAI_API_KEY) {
    console.error('OpenAI API key is not set or empty');
    return NextResponse.json({ error: 'OpenAI API key is not configured' }, { status: 500 });
  }

  try {
    const { message } = await request.json();
    console.log('Received message:', message);

    if (!message) {
      console.error('Missing message in request');
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    // Check if the message is asking about the name with multiple variations in Arabic and English
    const nameQueries = [
      'من انت؟',
      'وش اسمك',
      'وش اسمك؟',
      'ما اسمك؟',
      'ما اسمك',
      'ايش اسمك؟',
      'ايش اسمك',
      'عرف عن اسمك؟',
      'عرف عن اسمك',
      'what is your name',
      'your name?',
      'your name',
      'ممكن نتعرف؟',
      'ممكن نتعرف',
      'name?',
      'name',
      'who are you'
    ];
    if (nameQueries.some(query => message.toLowerCase().includes(query))) {
      console.log('Responding to name query with multiple variations');
      return NextResponse.json({
        message: 'اسمي اوليفيا .. وانا بوت ذكاء اصطناعي و مساعدك وقت حاجتك ...'
      });
    }

    // Check if the message is asking about the developer in Arabic with multiple variations
    const developerQueries = [
      'من هو مطورك',
      'من هو مطورك؟',
      'من مطورك؟',
      'من مطورك',
      'من هو المطور؟',
      'من هو المطور',
      'المطور؟',
      'المطور'
    ];
    if (developerQueries.some(query => message.includes(query))) {
      console.log('Responding to developer query in Arabic with multiple variations');
      return NextResponse.json({
        message: 'مطوري هو فيصل العتيبي'
      });
    }

    // Retry logic for transient errors
    const maxRetries = 2;
    let attempt = 0;
    let response;
    let errorDetails = '';

    while (attempt <= maxRetries) {
      try {
        console.log(`Attempt ${attempt + 1} to call OpenAI API`);
        response = await fetchWithTimeout(OPENAI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: message }],
          }),
          timeout: FETCH_TIMEOUT,
        });

        if (response.ok) {
          console.log('OpenAI API request successful');
          break; // success
        } else {
          errorDetails = await response.text();
          console.error(`OpenAI API request failed (status ${response.status}):`, errorDetails);
          // Log full error response for debugging
          try {
            const errorJson = JSON.parse(errorDetails);
            console.error('OpenAI API error details:', JSON.stringify(errorJson, null, 2));
          } catch (parseError) {
            console.error('Failed to parse OpenAI API error response:', parseError);
          }
          // Retry only on 429 (rate limit) or 503 (service unavailable)
          if (![429, 503].includes(response.status)) {
            return NextResponse.json(
              { error: 'OpenAI API request failed', details: errorDetails },
              { status: response.status }
            );
          }
        }
      } catch (fetchError) {
        console.error('Fetch error during OpenAI API request:', fetchError);
        errorDetails = fetchError instanceof Error ? fetchError.message : String(fetchError);
      }
      attempt++;
      if (attempt <= maxRetries) {
        console.log(`Retrying OpenAI API request, attempt ${attempt}...`);
        await new Promise(res => setTimeout(res, 1000 * attempt)); // exponential backoff
      }
    }

    if (!response || !response.ok) {
      console.error('OpenAI API request failed after retries');
      return NextResponse.json(
        { error: 'OpenAI API request failed after retries', details: errorDetails },
        { status: response ? response.status : 500 }
      );
    }

    const data = await response.json();
    console.log('OpenAI API response data:', data);

    // Validate response structure
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('Invalid OpenAI API response:', data);
      return NextResponse.json(
        { error: 'Invalid response from OpenAI API' },
        { status: 500 }
      );
    }

    // Return only the assistant's message content to simplify frontend handling
    const assistantMessage = data.choices[0].message.content;
    console.log('Assistant message:', assistantMessage);
    return NextResponse.json({ message: assistantMessage });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('OpenAI API request timed out');
      return NextResponse.json(
        { error: 'OpenAI API request timed out' },
        { status: 504 }
      );
    }
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to get response from AI' },
      { status: 500 }
    );
  }
}
