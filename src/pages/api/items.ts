import type { APIRoute } from 'astro';
import { db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();

    const providedPin = request.headers.get('x-auth-pin');
    const secretPin = import.meta.env.PUBLIC_SECRET_PIN;

    if (providedPin !== secretPin) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid PIN' }), {
        status: 401,
      });
    }

    if (!data.topic || !data.name || !data.owner) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
      });
    }

    const docRef = await addDoc(collection(db, 'items'), {
      ...data,
      createdAt: serverTimestamp(),
    });

    return new Response(
      JSON.stringify({
        message: 'Item created successfully',
        id: docRef.id,
      }),
      { status: 201 }
    );
  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
    });
  }
};
