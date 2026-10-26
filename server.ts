import express, { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPERIENCES = ['Café', 'Restaurant', 'Pub & Lounge'];

class Problem extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function passwordHash(password: string, salt?: string): string {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, s, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `${s}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt] = stored.split(':');
  if (!salt) return false;
  const candidate = passwordHash(password, salt);
  const a = Buffer.from(candidate);
  const b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// In-memory store replicating server/app.py schema & seed data
interface UserRecord {
  id: string;
  email: string;
  name: string;
  password: string;
  role: 'customer' | 'staff' | 'manager' | 'super_admin';
  verified: number;
  created_at: string;
}

interface MenuRecord {
  id: string;
  name: string;
  category: string;
  experience: string;
  image: string;
  price: number; // cents
  description: string;
  allergens: string;
  vegetarian: number;
  available: number;
}

interface TableRecord {
  id: string;
  name: string;
  experience: string;
  area: string;
  seats: number;
  active: number;
}

interface ReservationRecord {
  id: string;
  access_token: string;
  user_id: string | null;
  table_id: string;
  date: string;
  time: string;
  end_time: string;
  party: number;
  name: string;
  email: string;
  phone: string;
  notes: string;
  status: string;
  created_at: string;
}

interface OrderRecord {
  id: string;
  access_token: string;
  user_id: string | null;
  table_id: string | null;
  name: string;
  email: string;
  notes: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  payment_status: string;
  created_at: string;
}

interface OrderItemRecord {
  order_id: string;
  menu_id: string;
  name: string;
  quantity: number;
  unit_price: number;
}

interface EventRecord {
  id: string;
  title: string;
  description: string;
  image: string;
  date: string;
  time: string;
  capacity: number;
  status: 'draft' | 'published' | 'cancelled';
}

interface RegistrationRecord {
  id: string;
  event_id: string;
  email: string;
  name: string;
}

const users = new Map<string, UserRecord>();
const sessions = new Map<string, { user_id: string; expires: number }>();
const menu = new Map<string, MenuRecord>();
const tablesConfig = new Map<string, TableRecord>();
const blockedDates = new Set<string>();
const reservations = new Map<string, ReservationRecord>();
const orders = new Map<string, OrderRecord>();
const orderRequests = new Map<string, { order_id: string; fingerprint: string }>();
const orderItems: OrderItemRecord[] = [];
const favorites = new Map<string, Set<string>>();
const events = new Map<string, EventRecord>();
const registrations: RegistrationRecord[] = [];
const newsletter = new Map<string, { email: string; consented_at: string; token: string }>();
const auditLog: Array<{ id: number; actor: string | null; action: string; record_id: string; created_at: string }> = [];

const settingsStore: Record<string, any> = {
  demo: true,
  venue_name: 'After Work',
  address: '',
  phone: '',
  email: '',
  hours: {
    'Café': [8, 17],
    'Restaurant': [11, 22],
    'Pub & Lounge': [17, 23],
  },
  booking_minutes: 90,
  tax_basis_points: 0,
  ordering_enabled: true,
  max_party: 8,
  website_url: process.env.APP_URL || '',
};

function seedData() {
  const initialMenu: MenuRecord[] = [
    {
      id: 'berry',
      name: 'Berry & Vanilla Cream Pot',
      category: 'Desserts',
      experience: 'Café',
      image: 'dessert',
      price: 1200,
      description:
        'Silky vanilla cream meets bright seasonal berries in a little pot of happiness. Fresh, gently sweet, and made for one more spoonful.',
      allergens: 'Milk, eggs',
      vegetarian: 1,
      available: 1,
    },
    {
      id: 'sandwich',
      name: 'The Golden Grilled Cheese',
      category: 'Breakfast',
      experience: 'Café',
      image: 'sandwich',
      price: 1400,
      description:
        'Golden sourdough, a generous blend of melted cheddar and mozzarella, and a little comfort in every bite.',
      allergens: 'Wheat, milk',
      vegetarian: 1,
      available: 1,
    },
    {
      id: 'chicken',
      name: 'Crispy Chicken Platter',
      category: 'Main Courses',
      experience: 'Restaurant',
      image: 'chicken',
      price: 1800,
      description:
        'Crispy golden chicken, seasoned fries and our house-made creamy herb dip. A feel-good favorite.',
      allergens: 'Wheat, eggs, milk',
      vegetarian: 0,
      available: 1,
    },
    {
      id: 'sushi',
      name: 'Salmon Nigiri',
      category: 'Seafood',
      experience: 'Restaurant',
      image: 'sushi',
      price: 2200,
      description:
        'Beautifully cut salmon over delicately seasoned sushi rice, with pickled ginger and wasabi.',
      allergens: 'Fish, soy',
      vegetarian: 0,
      available: 1,
    },
    {
      id: 'coffee',
      name: 'Signature Cappuccino',
      category: 'Hot Coffee',
      experience: 'Café',
      image: 'coffee',
      price: 450,
      description:
        'Our house espresso with silky steamed milk. Rich, balanced, and made for slow mornings.',
      allergens: 'Milk',
      vegetarian: 1,
      available: 1,
    },
    {
      id: 'dinner',
      name: 'Chef’s Tasting Experience',
      category: 'Set Meals',
      experience: 'Restaurant',
      image: 'restaurant',
      price: 4800,
      description:
        'A seasonal journey through the kitchen, thoughtfully plated and made for memorable evenings.',
      allergens: 'Ask our team for the seasonal allergen list',
      vegetarian: 0,
      available: 1,
    },
  ];
  for (const m of initialMenu) {
    menu.set(m.id, m);
  }

  const seatsList = [2, 2, 4, 4, 8];
  seatsList.forEach((seats, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const id = `T${num}`;
    tablesConfig.set(id, {
      id,
      name: `Table ${num}`,
      experience: 'Restaurant',
      area: 'Indoor',
      seats,
      active: 1,
    });
  });

  // Add Café and Lounge tables so Café and Pub & Lounge reservations have available tables too
  tablesConfig.set('C01', {
    id: 'C01',
    name: 'Café Table 01',
    experience: 'Café',
    area: 'Indoor',
    seats: 4,
    active: 1,
  });
  tablesConfig.set('L01', {
    id: 'L01',
    name: 'Lounge Table 01',
    experience: 'Pub & Lounge',
    area: 'Lounge',
    seats: 6,
    active: 1,
  });

  // Pre-seed a demonstration super_admin account for convenience in web preview
  const adminId = crypto.randomBytes(12).toString('hex');
  users.set(adminId, {
    id: adminId,
    email: 'admin@afterwork.local',
    name: 'Administrator',
    password: passwordHash('afterwork1234'),
    role: 'super_admin',
    verified: 1,
    created_at: new Date().toISOString(),
  });

  // Pre-seed upcoming demonstration events
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  events.set('ev-coffee-workshop', {
    id: 'ev-coffee-workshop',
    title: 'Morning Pour-Over & Espresso Workshop',
    description: 'Explore single-origin beans, extraction balance, and silky microfoam texture with our head barista.',
    image: 'coffee',
    date: nextWeek,
    time: '10:00',
    capacity: 12,
    status: 'published',
  });
  events.set('ev-acoustic-evening', {
    id: 'ev-acoustic-evening',
    title: 'Unplugged Acoustic Lounge Evening',
    description: 'Live acoustic sets paired with late-evening small plates and signature zero-proof & craft pours.',
    image: 'restaurant',
    date: twoWeeks,
    time: '19:30',
    capacity: 30,
    status: 'published',
  });
}

seedData();

function phnomPenhNow(): Date {
  // UTC+7
  return new Date(Date.now() + 7 * 3600 * 1000);
}

function phnomPenhDateStr(): string {
  return phnomPenhNow().toISOString().slice(0, 10);
}

function validateEmail(val: any): string {
  const s = String(val ?? '').trim().toLowerCase();
  if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    throw new Problem('Enter a valid email address.');
  }
  return s;
}

function validateText(data: any, key: string, min = 1, max = 500): string {
  const val = String(data?.[key] ?? '').trim();
  if (val.length < min || val.length > max) {
    throw new Problem(`${key}: enter between ${min} and ${max} characters.`);
  }
  return val;
}

function validateInt(data: any, key: string, lo: number, hi: number): number {
  const val = data?.[key];
  if (typeof val === 'boolean' || typeof val !== 'number' || !Number.isInteger(val) || val < lo || val > hi) {
    throw new Problem(`${key}: expected a whole number from ${lo} to ${hi}.`);
  }
  return val;
}

function computeAvailability(data: any) {
  const exp = data?.experience;
  if (!EXPERIENCES.includes(exp)) throw new Problem('Select a valid experience.');
  const party = validateInt(data, 'party', 1, settingsStore.max_party);
  const dateStr = String(data?.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Problem('Select a valid date.');

  const todayStr = phnomPenhDateStr();
  const maxDateStr = new Date(phnomPenhNow().getTime() + 180 * 86400000).toISOString().slice(0, 10);
  if (dateStr < todayStr || dateStr > maxDateStr) {
    throw new Problem('Bookings must be within the next 180 days.');
  }
  if (blockedDates.has(dateStr)) {
    return [];
  }

  const area = data?.area || (exp === 'Pub & Lounge' ? 'Lounge' : 'Indoor');
  const matchingTables = Array.from(tablesConfig.values())
    .filter((t) => t.experience === exp && t.seats >= party && t.area === area && t.active === 1)
    .sort((a, b) => a.seats - b.seats);

  const [opening, closing] = settingsStore.hours[exp];
  const duration = settingsStore.booking_minutes;
  const nowPnh = phnomPenhNow();
  const currentMinutes = nowPnh.getUTCHours() * 60 + nowPnh.getUTCMinutes();

  const result: Array<{ time: string; end_time: string; table_id: string }> = [];
  for (let minute = opening * 60; minute <= closing * 60 - duration; minute += 30) {
    if (dateStr === todayStr && minute <= currentMinutes) continue;
    const start = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    const endMin = minute + duration;
    const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

    const freeTable = matchingTables.find((t) => {
      for (const r of reservations.values()) {
        if (
          r.table_id === t.id &&
          r.date === dateStr &&
          (r.status === 'confirmed' || r.status === 'pending') &&
          r.time < end &&
          r.end_time > start
        ) {
          return false;
        }
      }
      return true;
    });

    if (freeTable) {
      result.push({ time: start, end_time: end, table_id: freeTable.id });
    }
  }
  return result;
}

function getAuthenticatedUser(req: Request): UserRecord | null {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const session = sessions.get(hashed);
  if (!session || session.expires <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return users.get(session.user_id) || null;
}

function requireUser(req: Request, roles?: string[]): UserRecord {
  const user = getAuthenticatedUser(req);
  if (!user) throw new Problem('Please sign in.', 401);
  if (roles && !roles.includes(user.role)) {
    throw new Problem('You do not have permission for this action.', 403);
  }
  return user;
}

function addAudit(actor: string | null, action: string, record_id: string) {
  auditLog.unshift({
    id: auditLog.length + 1,
    actor,
    action,
    record_id,
    created_at: new Date().toISOString(),
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '32kb' }));

  // API Router
  const api = express.Router();

  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', mode: 'local development' });
  });

  api.get('/tables', (req, res) => {
    const defaultOrigin = `${req.protocol}://${req.get('host')}`;
    const list = Array.from(tablesConfig.values()).sort((a, b) => a.id.localeCompare(b.id));
    res.json({
      tables: list,
      website_url: settingsStore.website_url || defaultOrigin,
    });
  });

  api.get('/tables/:id', (req, res, next) => {
    try {
      const t = tablesConfig.get(req.params.id);
      if (!t || t.active !== 1) {
        throw new Problem('This table is inactive or does not exist. Please ask a staff member.', 404);
      }
      res.json({
        id: t.id,
        name: t.name,
        experience: t.experience,
        area: t.area,
        seats: t.seats,
      });
    } catch (e) {
      next(e);
    }
  });

  api.get('/settings', (_req, res) => {
    res.json(settingsStore);
  });

  api.get('/menu', (_req, res) => {
    const items = Array.from(menu.values()).filter((m) => m.available === 1);
    res.json({ items });
  });

  api.post('/availability', (req, res, next) => {
    try {
      const slots = computeAvailability(req.body).map((s) => ({ time: s.time }));
      res.json({ slots, demo: settingsStore.demo });
    } catch (e) {
      next(e);
    }
  });

  api.post('/auth/register', (req, res, next) => {
    try {
      const name = validateText(req.body, 'name', 2, 100);
      const address = validateEmail(req.body?.email);
      const password = validateText(req.body, 'password', 12, 200);
      for (const u of users.values()) {
        if (u.email === address) {
          throw new Problem('This record already exists or conflicts with another record.', 409);
        }
      }
      const uid = crypto.randomBytes(12).toString('hex');
      users.set(uid, {
        id: uid,
        email: address,
        name,
        password: passwordHash(password),
        role: 'customer',
        verified: 0,
        created_at: new Date().toISOString(),
      });
      res.json({
        message: 'Account created. Sign in to manage your demonstration bookings. Email delivery is not configured.',
      });
    } catch (e) {
      next(e);
    }
  });

  api.post('/auth/login', (req, res, next) => {
    try {
      const address = validateEmail(req.body?.email);
      const pwd = String(req.body?.password ?? '');
      const user = Array.from(users.values()).find((u) => u.email === address);
      if (!user || !verifyPassword(pwd, user.password)) {
        throw new Problem('Email or password is incorrect.', 401);
      }
      const token = crypto.randomBytes(30).toString('base64url');
      const hashed = crypto.createHash('sha256').update(token).digest('hex');
      sessions.set(hashed, {
        user_id: user.id,
        expires: Math.floor(Date.now() / 1000) + 86400,
      });
      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          verified: user.verified,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  api.post('/auth/logout', (req, res, next) => {
    try {
      requireUser(req);
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();
      const hashed = crypto.createHash('sha256').update(token).digest('hex');
      sessions.delete(hashed);
      res.json({ message: 'Signed out.' });
    } catch (e) {
      next(e);
    }
  });

  api.post('/auth/reset', (req, _res, next) => {
    try {
      validateEmail(req.body?.email);
      throw new Problem('Password reset email is not configured. Contact the server operator.', 503);
    } catch (e) {
      next(e);
    }
  });

  api.get('/me', (req, res, next) => {
    try {
      const user = requireUser(req);
      const userReservations = Array.from(reservations.values())
        .filter((r) => r.user_id === user.id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((r) => {
          const t = tablesConfig.get(r.table_id);
          return {
            id: r.id,
            date: r.date,
            time: r.time,
            party: r.party,
            status: r.status,
            experience: t?.experience || 'Restaurant',
            area: t?.area || 'Indoor',
          };
        });
      const userOrders = Array.from(orders.values())
        .filter((o) => o.user_id === user.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((o) => ({
          id: o.id,
          total: o.total,
          status: o.status,
          payment_status: o.payment_status,
          created_at: o.created_at,
          table_id: o.table_id,
        }));
      const userFavs = Array.from(favorites.get(user.id) || []);
      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          verified: user.verified,
        },
        reservations: userReservations,
        orders: userOrders,
        favorites: userFavs,
      });
    } catch (e) {
      next(e);
    }
  });

  api.patch('/me', (req, res, next) => {
    try {
      const user = requireUser(req);
      user.name = validateText(req.body, 'name', 2, 100);
      res.json({ message: 'Profile saved.' });
    } catch (e) {
      next(e);
    }
  });

  api.delete('/me', (req, res, next) => {
    try {
      const user = requireUser(req);
      const pwd = validateText(req.body, 'password', 12, 200);
      if (!verifyPassword(pwd, user.password)) {
        throw new Problem('Password incorrect.', 401);
      }
      users.delete(user.id);
      favorites.delete(user.id);
      res.json({
        message: 'Account deleted. Transaction records remain for operational recordkeeping.',
      });
    } catch (e) {
      next(e);
    }
  });

  api.post('/favorites', (req, res, next) => {
    try {
      const user = requireUser(req);
      const item = validateText(req.body, 'id', 1, 100);
      if (!favorites.has(user.id)) favorites.set(user.id, new Set());
      const set = favorites.get(user.id)!;
      if (req.body?.saved) {
        set.add(item);
      } else {
        set.delete(item);
      }
      res.json({ message: 'Favorites saved.' });
    } catch (e) {
      next(e);
    }
  });

  api.post('/reservations', (req, res, next) => {
    try {
      const name = validateText(req.body, 'name', 2, 100);
      const address = validateEmail(req.body?.email);
      const phone = validateText(req.body, 'phone', 6, 30);
      const notes = validateText(req.body, 'notes', 0, 1000);
      const slots = computeAvailability(req.body);
      const slot = slots.find((s) => s.time === req.body?.time);
      if (!slot) {
        throw new Problem('This time is no longer available. Choose another slot.', 409);
      }
      const user = getAuthenticatedUser(req);
      for (const r of reservations.values()) {
        if (
          r.email === address &&
          r.date === req.body.date &&
          r.time === slot.time &&
          (r.status === 'confirmed' || r.status === 'pending')
        ) {
          throw new Problem('You already have a reservation at this time.', 409);
        }
      }
      const rid = 'SH-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const access = crypto.randomBytes(24).toString('base64url');
      reservations.set(rid, {
        id: rid,
        access_token: access,
        user_id: user ? user.id : null,
        table_id: slot.table_id,
        date: req.body.date,
        time: slot.time,
        end_time: slot.end_time,
        party: req.body.party,
        name,
        email: address,
        phone,
        notes,
        status: 'confirmed',
        created_at: new Date().toISOString(),
      });
      addAudit(user ? user.id : null, 'reservation.created', rid);
      res.json({
        id: rid,
        access_token: access,
        status: 'confirmed',
        date: req.body.date,
        time: slot.time,
        demo: settingsStore.demo,
        message:
          'Saved to the local demonstration database. This is not a reservation at a real venue. Save your reference and access token.',
      });
    } catch (e) {
      next(e);
    }
  });

  api.get('/reservations/:id', (req, res, next) => {
    try {
      const r = reservations.get(req.params.id);
      if (!r) throw new Problem('Reservation not found.', 404);
      const user = getAuthenticatedUser(req);
      const tokenParam = String(req.query.access_token ?? '');
      const authorized =
        (user && (r.user_id === user.id || ['super_admin', 'manager', 'staff'].includes(user.role))) ||
        (tokenParam && tokenParam === r.access_token);
      if (!authorized) {
        throw new Problem('Your booking access token or account is required.', 403);
      }
      const t = tablesConfig.get(r.table_id);
      res.json({
        id: r.id,
        date: r.date,
        time: r.time,
        party: r.party,
        status: r.status,
        experience: t?.experience || 'Restaurant',
        area: t?.area || 'Indoor',
        name: r.name,
        notes: r.notes,
      });
    } catch (e) {
      next(e);
    }
  });

  api.patch('/reservations/:id', (req, res, next) => {
    try {
      const r = reservations.get(req.params.id);
      if (!r) throw new Problem('Reservation not found.', 404);
      const user = getAuthenticatedUser(req);
      const tokenParam = String(req.body?.access_token ?? req.query.access_token ?? '');
      const authorized =
        (user && (r.user_id === user.id || ['super_admin', 'manager', 'staff'].includes(user.role))) ||
        (tokenParam && tokenParam === r.access_token);
      if (!authorized) {
        throw new Problem('Your booking access token or account is required.', 403);
      }
      const status = req.body?.status || 'cancelled';
      if (status !== 'cancelled') {
        requireUser(req, ['super_admin', 'manager', 'staff']);
      }
      if (!['pending', 'confirmed', 'cancelled', 'completed', 'no-show'].includes(status)) {
        throw new Problem('Invalid reservation status.');
      }
      if (['pending', 'confirmed'].includes(status) && !['pending', 'confirmed'].includes(r.status)) {
        throw new Problem('Cancelled or completed bookings cannot be reopened. Create a new booking.');
      }
      r.status = status;
      addAudit(user ? user.id : null, `reservation.${status}`, r.id);
      res.json({ message: 'Reservation updated.' });
    } catch (e) {
      next(e);
    }
  });

  api.post('/orders', (req, res, next) => {
    try {
      if (!settingsStore.ordering_enabled) {
        throw new Problem('Ordering is currently closed.', 409);
      }
      const name = validateText(req.body, 'name', 2, 100);
      const address = validateEmail(req.body?.email);
      const notes = validateText(req.body, 'notes', 0, 1000);
      const items = req.body?.items;
      if (!Array.isArray(items) || items.length < 1 || items.length > 30) {
        throw new Problem('Add between 1 and 30 items.');
      }
      const requestKey = validateText(req.body, 'request_key', 10, 120);
      const fingerprint = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
      const previous = orderRequests.get(requestKey);
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          throw new Problem('This checkout key was already used with different details.', 409);
        }
        const prevOrder = orders.get(previous.order_id)!;
        res.json({
          id: prevOrder.id,
          access_token: prevOrder.access_token,
          status: prevOrder.status,
          payment_status: prevOrder.payment_status,
          total: prevOrder.total,
          demo: settingsStore.demo,
          message: 'Previously submitted demonstration order retrieved. No duplicate order was created.',
        });
        return;
      }

      const tableId = req.body?.table_id || null;
      if (tableId) {
        const tbl = tablesConfig.get(tableId);
        if (!tbl || tbl.active !== 1) {
          throw new Problem('This table is no longer active. Please scan a current QR code.', 409);
        }
      }

      const lines: Array<{ product: MenuRecord; qty: number }> = [];
      let subtotal = 0;
      for (const item of items) {
        const qty = validateInt(item, 'quantity', 1, 20);
        const product = menu.get(item?.id);
        if (!product || product.available !== 1) {
          throw new Problem('A menu item is no longer available.', 409);
        }
        if (item?.unit_price !== product.price) {
          throw new Problem('A price has changed. Refresh the menu and review your bag.', 409);
        }
        lines.push({ product, qty });
        subtotal += product.price * qty;
      }

      const tax = Math.floor((subtotal * settingsStore.tax_basis_points + 5000) / 10000);
      const oid = 'ORD-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const access = crypto.randomBytes(24).toString('base64url');
      const user = getAuthenticatedUser(req);

      orders.set(oid, {
        id: oid,
        access_token: access,
        user_id: user ? user.id : null,
        table_id: tableId,
        name,
        email: address,
        notes,
        subtotal,
        tax,
        total: subtotal + tax,
        status: 'submitted',
        payment_status: 'unpaid',
        created_at: new Date().toISOString(),
      });

      for (const l of lines) {
        orderItems.push({
          order_id: oid,
          menu_id: l.product.id,
          name: l.product.name,
          quantity: l.qty,
          unit_price: l.product.price,
        });
      }

      orderRequests.set(requestKey, { order_id: oid, fingerprint });
      addAudit(user ? user.id : null, 'order.submitted', oid);

      res.json({
        id: oid,
        access_token: access,
        status: 'submitted',
        payment_status: 'unpaid',
        total: subtotal + tax,
        demo: settingsStore.demo,
        message: 'Order saved to the demonstration database. No payment was taken and no real kitchen was notified.',
      });
    } catch (e) {
      next(e);
    }
  });

  api.get('/orders/:id', (req, res, next) => {
    try {
      const order = orders.get(req.params.id);
      if (!order) throw new Problem('Order not found.', 404);
      const user = getAuthenticatedUser(req);
      const tokenParam = String(req.query.access_token ?? '');
      const authorized =
        (user && (user.id === order.user_id || ['super_admin', 'manager', 'staff'].includes(user.role))) ||
        (tokenParam && tokenParam === order.access_token);
      if (!authorized) {
        throw new Problem('Order access token or account required.', 403);
      }
      res.json({
        order: {
          id: order.id,
          status: order.status,
          total: order.total,
          payment_status: order.payment_status,
          notes: order.notes,
          created_at: order.created_at,
          table_id: order.table_id,
        },
        items: orderItems
          .filter((i) => i.order_id === order.id)
          .map((i) => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price })),
      });
    } catch (e) {
      next(e);
    }
  });

  api.patch('/orders/:id', (req, res, next) => {
    try {
      const order = orders.get(req.params.id);
      if (!order) throw new Problem('Order not found.', 404);
      const user = getAuthenticatedUser(req);
      const tokenParam = String(req.body?.access_token ?? req.query.access_token ?? '');
      const authorized =
        (user && (user.id === order.user_id || ['super_admin', 'manager', 'staff'].includes(user.role))) ||
        (tokenParam && tokenParam === order.access_token);
      if (!authorized) {
        throw new Problem('Order access token or account required.', 403);
      }
      const status = String(req.body?.status ?? '');
      const transitions: Record<string, string[]> = {
        submitted: ['accepted', 'rejected', 'cancelled'],
        accepted: ['preparing', 'cancelled'],
        preparing: ['ready'],
        ready: ['completed'],
      };
      if (status !== 'cancelled') {
        requireUser(req, ['super_admin', 'manager', 'staff']);
      } else if (!(user && ['super_admin', 'manager', 'staff'].includes(user.role)) && order.status !== 'submitted') {
        throw new Problem('Only unaccepted orders can be cancelled online.', 409);
      }
      if (!(transitions[order.status] || []).includes(status)) {
        throw new Problem('This status change is not allowed.', 409);
      }
      order.status = status;
      addAudit(user ? user.id : null, `order.${status}`, order.id);
      res.json({ message: 'Order updated.' });
    } catch (e) {
      next(e);
    }
  });

  api.get('/events', (_req, res) => {
    const today = phnomPenhDateStr();
    const list = Array.from(events.values())
      .filter((e) => (e.status === 'published' || e.status === 'cancelled') && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({
        ...e,
        registered: registrations.filter((r) => r.event_id === e.id).length,
      }));
    res.json({ events: list });
  });

  api.post('/events/register', (req, res, next) => {
    try {
      const name = validateText(req.body, 'name', 2, 100);
      const address = validateEmail(req.body?.email);
      const event = events.get(req.body?.event_id);
      const today = phnomPenhDateStr();
      if (!event || event.status !== 'published' || event.date < today) {
        throw new Problem('This event is not accepting registrations.', 409);
      }
      const count = registrations.filter((r) => r.event_id === event.id).length;
      if (count >= event.capacity) {
        throw new Problem('This event is sold out.', 409);
      }
      if (registrations.some((r) => r.event_id === event.id && r.email === address)) {
        throw new Problem('This record already exists or conflicts with another record.', 409);
      }
      const rid = 'EV-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      registrations.push({ id: rid, event_id: event.id, email: address, name });
      res.json({ id: rid, message: 'Registration saved to the local demonstration database.' });
    } catch (e) {
      next(e);
    }
  });

  api.post('/newsletter', (req, res, next) => {
    try {
      if (req.body?.consent !== true) {
        throw new Problem('Please explicitly consent to receive updates.');
      }
      const address = validateEmail(req.body?.email);
      if (newsletter.has(address)) {
        throw new Problem('This record already exists or conflicts with another record.', 409);
      }
      const token = crypto.randomBytes(24).toString('base64url');
      newsletter.set(address, {
        email: address,
        consented_at: new Date().toISOString(),
        token,
      });
      res.json({
        message: 'Consent saved locally. Email delivery is not configured. Save this unsubscribe token.',
        unsubscribe_token: token,
      });
    } catch (e) {
      next(e);
    }
  });

  api.post('/newsletter/unsubscribe', (req, res, next) => {
    try {
      const token = validateText(req.body, 'token', 20, 100);
      for (const [emailKey, rec] of newsletter.entries()) {
        if (rec.token === token) {
          newsletter.delete(emailKey);
        }
      }
      res.json({ message: 'Unsubscribed.' });
    } catch (e) {
      next(e);
    }
  });

  api.get('/admin/overview', (req, res, next) => {
    try {
      const user = requireUser(req, ['super_admin', 'manager', 'staff']);
      const today = phnomPenhDateStr();
      const resList = Array.from(reservations.values())
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 200)
        .map((r) => ({
          id: r.id,
          date: r.date,
          time: r.time,
          name: r.name,
          party: r.party,
          status: r.status,
          experience: tablesConfig.get(r.table_id)?.experience || 'Restaurant',
        }));
      const ordList = Array.from(orders.values())
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 200)
        .map((o) => ({
          id: o.id,
          name: o.name,
          total: o.total,
          status: o.status,
          payment_status: o.payment_status,
          created_at: o.created_at,
          table_id: o.table_id,
        }));
      const todayConfirmed = Array.from(reservations.values()).filter(
        (r) => r.date === today && r.status === 'confirmed'
      );
      res.json({
        reservations: resList,
        orders: ordList,
        today_reservations: todayConfirmed.length,
        today_guests: todayConfirmed.reduce((sum, r) => sum + r.party, 0),
        verified_sales: 0,
        menu: Array.from(menu.values()),
        events: Array.from(events.values()),
        settings: settingsStore,
        tables: Array.from(tablesConfig.values()),
        blocked_dates: Array.from(blockedDates).map((d) => ({ date: d })),
        audit: ['super_admin', 'manager'].includes(user.role) ? auditLog.slice(0, 50) : [],
      });
    } catch (e) {
      next(e);
    }
  });

  const handleSaveTable = (req: Request, res: Response, next: express.NextFunction) => {
    try {
      const user = requireUser(req, ['super_admin', 'manager']);
      const tid = validateText(req.body, 'id', 1, 40);
      if (!/^[A-Za-z0-9_-]+$/.test(tid)) {
        throw new Problem('Table IDs can contain letters, numbers, underscores and hyphens.');
      }
      const name = validateText(req.body, 'name', 1, 60);
      const seats = validateInt(req.body, 'seats', 1, 20);
      const exp = req.body?.experience || 'Restaurant';
      const area = validateText(req.body, 'area', 1, 60);
      if (!EXPERIENCES.includes(exp)) throw new Problem('Select a valid experience.');
      const existing = tablesConfig.get(tid);
      if (req.method === 'POST' && existing) {
        throw new Problem('This table ID already exists. Choose another ID.', 409);
      }
      if (req.method === 'PATCH' && !existing) {
        throw new Problem('Table not found.', 404);
      }
      tablesConfig.set(tid, {
        id: tid,
        name,
        seats,
        experience: exp,
        area,
        active: req.body?.active === false || req.body?.active === 0 ? 0 : 1,
      });
      addAudit(user.id, 'table.saved', tid);
      res.json({ message: 'Table saved. Its QR link remains stable.', id: tid });
    } catch (e) {
      next(e);
    }
  };
  api.post('/admin/tables', handleSaveTable);
  api.patch('/admin/tables', handleSaveTable);

  const handleSaveMenu = (req: Request, res: Response, next: express.NextFunction) => {
    try {
      const user = requireUser(req, ['super_admin', 'manager']);
      const id = validateText(req.body, 'id', 1, 100);
      const name = validateText(req.body, 'name', 2, 100);
      const category = validateText(req.body, 'category', 1, 60);
      const experience = validateText(req.body, 'experience', 1, 40);
      const image = validateText(req.body, 'image', 1, 60);
      const price = validateInt(req.body, 'price', 0, 1000000);
      const description = validateText(req.body, 'description', 1, 2000);
      const allergens = validateText(req.body, 'allergens', 0, 300);
      if (
        !EXPERIENCES.includes(experience) ||
        !['dessert', 'sandwich', 'chicken', 'sushi', 'coffee', 'restaurant'].includes(image)
      ) {
        throw new Problem('Select a supported experience and image asset.');
      }
      menu.set(id, {
        id,
        name,
        category,
        experience,
        image,
        price,
        description,
        allergens,
        vegetarian: req.body?.vegetarian ? 1 : 0,
        available: req.body?.available === false || req.body?.available === 0 ? 0 : 1,
      });
      addAudit(user.id, 'menu.saved', id);
      res.json({ message: 'Menu item saved.' });
    } catch (e) {
      next(e);
    }
  };
  api.post('/admin/menu', handleSaveMenu);
  api.patch('/admin/menu', handleSaveMenu);

  const handleSaveEvent = (req: Request, res: Response, next: express.NextFunction) => {
    try {
      const user = requireUser(req, ['super_admin', 'manager']);
      const eid = validateText(req.body, 'id', 1, 100);
      const title = validateText(req.body, 'title', 2, 150);
      const description = validateText(req.body, 'description', 1, 2000);
      const date = validateText(req.body, 'date', 10, 10);
      const time = validateText(req.body, 'time', 5, 5);
      const capacity = validateInt(req.body, 'capacity', 1, 10000);
      const status = req.body?.status || 'draft';
      if (!['draft', 'published', 'cancelled'].includes(status)) {
        throw new Problem('Invalid event status.');
      }
      const regCount = registrations.filter((r) => r.event_id === eid).length;
      if (capacity < regCount) {
        throw new Problem('Capacity is below existing registrations.');
      }
      events.set(eid, {
        id: eid,
        title,
        description,
        image: 'restaurant',
        date,
        time,
        capacity,
        status,
      });
      addAudit(user.id, 'event.saved', eid);
      res.json({ message: 'Event saved.' });
    } catch (e) {
      next(e);
    }
  };
  api.post('/admin/events', handleSaveEvent);
  api.patch('/admin/events', handleSaveEvent);

  api.post('/admin/blocks', (req, res, next) => {
    try {
      const user = requireUser(req, ['super_admin', 'manager']);
      const date = validateText(req.body, 'date', 10, 10);
      if (req.body?.blocked !== false) {
        blockedDates.add(date);
      } else {
        blockedDates.delete(date);
      }
      addAudit(user.id, 'date.blocked', date);
      res.json({ message: 'Closed dates updated.' });
    } catch (e) {
      next(e);
    }
  });

  api.patch('/admin/settings', (req, res, next) => {
    try {
      const user = requireUser(req, ['super_admin', 'manager']);
      const allowed = new Set([
        'venue_name',
        'address',
        'phone',
        'email',
        'booking_minutes',
        'tax_basis_points',
        'ordering_enabled',
        'max_party',
        'hours',
        'website_url',
      ]);
      for (const [k, v] of Object.entries(req.body || {})) {
        if (!allowed.has(k)) throw new Problem('Unsupported setting: ' + k);
        settingsStore[k] = v;
      }
      addAudit(user.id, 'settings.updated', 'venue');
      res.json({ message: 'Settings saved.' });
    } catch (e) {
      next(e);
    }
  });

  app.use('/api', api);

  // API error handler
  app.use('/api', (err: any, _req: Request, res: Response, _next: express.NextFunction) => {
    if (err instanceof Problem) {
      res.status(err.status).json({ error: err.message });
    } else {
      res.status(400).json({ error: err?.message || 'Invalid request data.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`After Work server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
