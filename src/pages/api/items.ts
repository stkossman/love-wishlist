import type { APIRoute } from 'astro';
import { db } from '../../lib/firebase';
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
} from 'firebase/firestore';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const owner = url.searchParams.get('owner');
  const cursorStr = url.searchParams.get('cursor');
  const pageSize = 6;

  try {
    let q = collection(db, 'items');
    let constraints: any[] = [orderBy('createdAt', 'desc'), limit(pageSize)];

    if (owner) {
      constraints.unshift(where('owner', '==', owner));
    }

    if (cursorStr) {
      const date = new Date(cursorStr);
      const cursorTimestamp = Timestamp.fromDate(date);
      constraints.push(startAfter(cursorTimestamp));
    }

    // @ts-ignore
    const finalQuery = query(q, ...constraints);
    const snapshot = await getDocs(finalQuery);

    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate().toISOString(),
      };
    });

    return new Response(
      JSON.stringify({
        items,
        nextCursor: items.length === pageSize ? items[items.length - 1].createdAt : null,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Fetch Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch items' }), { status: 500 });
  }
};

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
