import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class Api {
  static const base = String.fromEnvironment(
    'SOCIAL_API',
    defaultValue: 'http://127.0.0.1:8787/api',
  );
  static String? token;
  static Map<String, dynamic>? user;

  static final Map<String, dynamic> _settings = {
    'demo': true,
    'venue_name': 'After Work',
    'address': '',
    'phone': '',
    'email': '',
    'hours': {
      'Café': [8, 17],
      'Restaurant': [11, 22],
      'Pub & Lounge': [17, 23],
    },
    'booking_minutes': 90,
    'tax_basis_points': 0,
    'ordering_enabled': true,
    'max_party': 8,
    'website_url': Uri.base.origin.startsWith('http')
        ? Uri.base.origin
        : 'http://127.0.0.1:8080',
  };

  static final List<Map<String, dynamic>> _menu = [
    {
      'id': 'berry',
      'name': 'Berry & Vanilla Cream Pot',
      'category': 'Desserts',
      'experience': 'Café',
      'image': 'dessert',
      'price': 1200,
      'description':
          'Silky vanilla cream meets bright seasonal berries in a little pot of happiness. Fresh, gently sweet, and made for one more spoonful.',
      'allergens': 'Milk, eggs',
      'vegetarian': 1,
      'available': 1,
    },
    {
      'id': 'sandwich',
      'name': 'The Golden Grilled Cheese',
      'category': 'Breakfast',
      'experience': 'Café',
      'image': 'sandwich',
      'price': 1400,
      'description':
          'Golden sourdough, a generous blend of melted cheddar and mozzarella, and a little comfort in every bite.',
      'allergens': 'Wheat, milk',
      'vegetarian': 1,
      'available': 1,
    },
    {
      'id': 'chicken',
      'name': 'Crispy Chicken Platter',
      'category': 'Main Courses',
      'experience': 'Restaurant',
      'image': 'chicken',
      'price': 1800,
      'description':
          'Crispy golden chicken, seasoned fries and our house-made creamy herb dip. A feel-good favorite.',
      'allergens': 'Wheat, eggs, milk',
      'vegetarian': 0,
      'available': 1,
    },
    {
      'id': 'sushi',
      'name': 'Salmon Nigiri',
      'category': 'Seafood',
      'experience': 'Restaurant',
      'image': 'sushi',
      'price': 2200,
      'description':
          'Beautifully cut salmon over delicately seasoned sushi rice, with pickled ginger and wasabi.',
      'allergens': 'Fish, soy',
      'vegetarian': 0,
      'available': 1,
    },
    {
      'id': 'coffee',
      'name': 'Signature Cappuccino',
      'category': 'Hot Coffee',
      'experience': 'Café',
      'image': 'coffee',
      'price': 450,
      'description':
          'Our house espresso with silky steamed milk. Rich, balanced, and made for slow mornings.',
      'allergens': 'Milk',
      'vegetarian': 1,
      'available': 1,
    },
    {
      'id': 'dinner',
      'name': 'Chef’s Tasting Experience',
      'category': 'Set Meals',
      'experience': 'Restaurant',
      'image': 'restaurant',
      'price': 4800,
      'description':
          'A seasonal journey through the kitchen, thoughtfully plated and made for memorable evenings.',
      'allergens': 'Ask our team for the seasonal allergen list',
      'vegetarian': 0,
      'available': 1,
    },
  ];

  static final List<Map<String, dynamic>> _tables = [
    for (final entry in [
      ('T01', 'Table 01', 2),
      ('T02', 'Table 02', 2),
      ('T03', 'Table 03', 4),
      ('T04', 'Table 04', 4),
      ('T05', 'Table 05', 8),
    ])
      {
        'id': entry.$1,
        'name': entry.$2,
        'experience': 'Restaurant',
        'area': 'Indoor',
        'seats': entry.$3,
        'active': 1,
      },
  ];

  static final List<Map<String, dynamic>> _events = [];
  static final List<Map<String, dynamic>> _reservations = [];
  static final List<Map<String, dynamic>> _orders = [];
  static final Set<String> _favorites = {};

  static Future<dynamic> request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? data,
  }) async {
    try {
      final req = http.Request(method, Uri.parse('$base$path'));
      req.headers['Content-Type'] = 'application/json';
      if (token != null) req.headers['Authorization'] = 'Bearer $token';
      if (data != null) req.body = jsonEncode(data);
      final response = await http.Response.fromStream(
        await req.send().timeout(const Duration(seconds: 2)),
      );
      final decoded = jsonDecode(response.body);
      if (response.statusCode >= 400) {
        throw Exception(decoded['error'] ?? 'Request failed.');
      }
      return decoded;
    } on Exception catch (e) {
      if (e is http.ClientException || e is TimeoutException) {
        return _fallback(path, method: method, data: data ?? {});
      }
      rethrow;
    }
  }

  static dynamic _fallback(
    String rawPath, {
    required String method,
    required Map<String, dynamic> data,
  }) {
    final uri = Uri.parse(rawPath);
    final path = uri.path;
    if (path == '/menu' && method == 'GET') {
      return {
        'items': _menu.where((m) => m['available'] == 1).toList(),
      };
    }
    if (path == '/tables' && method == 'GET') {
      return {
        'tables': _tables,
        'website_url': _settings['website_url'],
      };
    }
    if (path.startsWith('/tables/') && method == 'GET') {
      final id = Uri.decodeComponent(path.split('/').last);
      final match = _tables.where((t) => t['id'] == id && t['active'] == 1);
      if (match.isEmpty) {
        throw Exception(
          'This table is inactive or does not exist. Please ask a staff member.',
        );
      }
      return match.first;
    }
    if (path == '/settings' && method == 'GET') {
      return Map<String, dynamic>.from(_settings);
    }
    if (path == '/events' && method == 'GET') {
      return {'events': _events};
    }
    if (path == '/availability' && method == 'POST') {
      final exp = data['experience'] ?? 'Restaurant';
      final hours = (_settings['hours'][exp] as List?) ?? [11, 22];
      final open = (hours[0] as int) * 60;
      final close = (hours[1] as int) * 60 - 90;
      final slots = <Map<String, String>>[];
      for (var m = open; m <= close; m += 30) {
        final h = (m ~/ 60).toString().padLeft(2, '0');
        final min = (m % 60).toString().padLeft(2, '0');
        slots.add({'time': '$h:$min'});
      }
      return {'slots': slots, 'demo': true};
    }
    if (path == '/reservations' && method == 'POST') {
      final id = 'SH-${DateTime.now().millisecondsSinceEpoch % 100000}';
      final rec = {
        'id': id,
        'access_token': 'demo-token-$id',
        'status': 'confirmed',
        'date': data['date'],
        'time': data['time'],
        'party': data['party'] ?? 2,
        'experience': data['experience'] ?? 'Restaurant',
        'area': data['area'] ?? 'Indoor',
        'name': data['name'] ?? '',
        'notes': data['notes'] ?? '',
        'demo': true,
        'message':
            'Saved to the local demonstration database. This is not a reservation at a real venue.',
      };
      _reservations.insert(0, rec);
      return rec;
    }
    if (path.startsWith('/reservations/')) {
      final id = Uri.decodeComponent(path.split('/').last);
      final match = _reservations.where((r) => r['id'] == id);
      if (match.isEmpty) throw Exception('Reservation not found.');
      if (method == 'PATCH') {
        match.first['status'] = data['status'] ?? 'cancelled';
        return {'message': 'Reservation updated.'};
      }
      return match.first;
    }
    if (path == '/orders' && method == 'POST') {
      final items = (data['items'] as List?) ?? [];
      if (items.isEmpty) throw Exception('Add between 1 and 30 items.');
      var total = 0;
      for (final item in items) {
        total += ((item['unit_price'] as int?) ?? 0) * ((item['quantity'] as int?) ?? 1);
      }
      final id = 'ORD-${DateTime.now().millisecondsSinceEpoch % 100000}';
      final rec = {
        'id': id,
        'access_token': 'demo-order-$id',
        'status': 'submitted',
        'payment_status': 'unpaid',
        'total': total,
        'name': data['name'] ?? '',
        'notes': data['notes'] ?? '',
        'table_id': data['table_id'],
        'created_at': DateTime.now().toIso8601String(),
        'demo': true,
        'message':
            'Order saved to the demonstration database. No payment was taken and no real kitchen was notified.',
      };
      _orders.insert(0, rec);
      return rec;
    }
    if (path.startsWith('/orders/')) {
      final id = Uri.decodeComponent(path.split('/').last);
      final match = _orders.where((o) => o['id'] == id);
      if (match.isEmpty) throw Exception('Order not found.');
      if (method == 'PATCH') {
        match.first['status'] = data['status'] ?? 'cancelled';
        return {'message': 'Order updated.'};
      }
      return {'order': match.first, 'items': []};
    }
    if (path == '/newsletter' && method == 'POST') {
      if (data['consent'] != true) {
        throw Exception('Please explicitly consent to receive updates.');
      }
      return {
        'message':
            'Consent saved locally. Email delivery is not configured. Save this unsubscribe token.',
        'unsubscribe_token': 'unsub-${DateTime.now().millisecondsSinceEpoch}',
      };
    }
    if (path == '/newsletter/unsubscribe' && method == 'POST') {
      return {'message': 'Unsubscribed.'};
    }
    if (path == '/auth/register' && method == 'POST') {
      return {
        'message':
            'Account created. Sign in to manage your demonstration bookings. Email delivery is not configured.',
      };
    }
    if (path == '/auth/login' && method == 'POST') {
      final email = (data['email'] ?? '').toString().trim();
      final u = {
        'id': 'usr-1',
        'name': email.contains('admin') ? 'Administrator' : email.split('@').first,
        'email': email,
        'role': 'super_admin',
        'verified': 1,
      };
      token = 'demo-session-token';
      user = u;
      return {'token': token, 'user': u};
    }
    if (path == '/auth/logout' && method == 'POST') {
      token = null;
      user = null;
      return {'message': 'Signed out.'};
    }
    if (path == '/auth/reset' && method == 'POST') {
      throw Exception(
        'Password reset email is not configured. Contact the server operator.',
      );
    }
    if (path == '/me') {
      if (method == 'PATCH') {
        user?['name'] = data['name'] ?? user?['name'];
        return {'message': 'Profile saved.'};
      }
      if (method == 'DELETE') {
        token = null;
        user = null;
        return {
          'message':
              'Account deleted. Transaction records remain for operational recordkeeping.',
        };
      }
      return {
        'user': user,
        'reservations': _reservations,
        'orders': _orders,
        'favorites': _favorites.toList(),
      };
    }
    if (path == '/favorites' && method == 'POST') {
      final id = data['id']?.toString() ?? '';
      if (data['saved'] == true) {
        _favorites.add(id);
      } else {
        _favorites.remove(id);
      }
      return {'message': 'Favorites saved.'};
    }
    if (path == '/admin/overview' && method == 'GET') {
      return {
        'reservations': _reservations,
        'orders': _orders,
        'today_reservations': _reservations.length,
        'today_guests': _reservations.fold<int>(
          0,
          (a, r) => a + ((r['party'] as int?) ?? 0),
        ),
        'verified_sales': 0,
        'menu': _menu,
        'events': _events,
        'settings': _settings,
        'tables': _tables,
        'blocked_dates': [],
        'audit': [],
      };
    }
    if (path == '/admin/tables' && (method == 'POST' || method == 'PATCH')) {
      final id = data['id']?.toString() ?? '';
      _tables.removeWhere((t) => t['id'] == id);
      _tables.add({
        'id': id,
        'name': data['name'] ?? id,
        'seats': data['seats'] ?? 4,
        'experience': data['experience'] ?? 'Restaurant',
        'area': data['area'] ?? 'Indoor',
        'active': (data['active'] == false || data['active'] == 0) ? 0 : 1,
      });
      return {'message': 'Table saved. Its QR link remains stable.', 'id': id};
    }
    if (path == '/admin/menu') {
      final id = data['id']?.toString() ?? '';
      _menu.removeWhere((m) => m['id'] == id);
      _menu.add({
        ...data,
        'vegetarian': data['vegetarian'] == true || data['vegetarian'] == 1 ? 1 : 0,
        'available': data['available'] == false || data['available'] == 0 ? 0 : 1,
      });
      return {'message': 'Menu item saved.'};
    }
    if (path == '/admin/events') {
      final id = data['id']?.toString() ?? '';
      _events.removeWhere((e) => e['id'] == id);
      _events.add({...data, 'registered': 0});
      return {'message': 'Event saved.'};
    }
    if (path == '/admin/settings') {
      _settings.addAll(data);
      return {'message': 'Settings saved.'};
    }
    if (path == '/admin/blocks') {
      return {'message': 'Closed dates updated.'};
    }
    return {};
  }
}

class ServicePage extends StatefulWidget {
  final String page;
  final Map<String, dynamic>? order;
  final VoidCallback? onOrdered;
  final VoidCallback? onMenuChanged;
  const ServicePage({
    super.key,
    required this.page,
    this.order,
    this.onOrdered,
    this.onMenuChanged,
  });
  @override
  State<ServicePage> createState() => _ServicePageState();
}

class _ServicePageState extends State<ServicePage> {
  final form = GlobalKey<FormState>();
  final name = TextEditingController(),
      email = TextEditingController(),
      password = TextEditingController(),
      phone = TextEditingController(),
      notes = TextEditingController(),
      reference = TextEditingController(),
      access = TextEditingController();
  final requestKey = 'checkout-${DateTime.now().microsecondsSinceEpoch}';
  String experience = 'Restaurant', time = '', message = '';
  int party = 2;
  DateTime? date;
  bool busy = false, registering = false, consent = false;
  List<dynamic> slots = [];
  dynamic result;
  Map<String, dynamic>? account, admin;
  @override
  void initState() {
    super.initState();
    if (Api.user != null) {
      name.text = Api.user!['name'];
      email.text = Api.user!['email'];
    }
    if (widget.page == 'Account' && Api.token != null) {
      loadAccount();
    }
    if (widget.page == 'Admin' && Api.token != null) {
      loadAdmin();
    }
  }

  @override
  void dispose() {
    for (final c in [name, email, password, phone, notes, reference, access]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> action(Future<void> Function() operation) async {
    setState(() {
      busy = true;
      message = '';
    });
    try {
      await operation();
    } catch (e) {
      if (mounted) {
        setState(() => message = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> loadAccount() => action(() async {
    final value = await Api.request('/me');
    if (mounted) setState(() => account = Map<String, dynamic>.from(value));
  });
  Future<void> loadAdmin() => action(() async {
    final value = await Api.request('/admin/overview');
    if (mounted) setState(() => admin = Map<String, dynamic>.from(value));
  });
  Widget field(
    String label,
    TextEditingController controller, {
    bool secret = false,
    bool required = true,
    int lines = 1,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 15),
    child: TextFormField(
      controller: controller,
      obscureText: secret,
      maxLines: lines,
      keyboardType: label.contains('Email')
          ? TextInputType.emailAddress
          : label.contains('Phone')
          ? TextInputType.phone
          : TextInputType.text,
      decoration: InputDecoration(labelText: label),
      validator: (s) {
        if (!required) return null;
        if (s == null || s.trim().isEmpty) return 'Please enter $label';
        if (label.contains('Email') &&
            !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(s.trim())) {
          return 'Enter a valid email';
        }
        return null;
      },
    ),
  );
  Widget button(String label, VoidCallback onTap) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: FilledButton(onPressed: busy ? null : onTap, child: Text(label)),
  );
  Widget heading(String text) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 18),
    child: Text(
      text,
      style: const TextStyle(
        fontFamily: 'SocialSerif',
        fontSize: 36,
        height: 1.1,
      ),
    ),
  );
  Widget notice(String text) => Container(
    width: double.infinity,
    margin: const EdgeInsets.symmetric(vertical: 15),
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: const Color(0xFFEAE5D8),
      borderRadius: BorderRadius.circular(8),
    ),
    child: SelectableText(
      text,
      style: const TextStyle(fontSize: 12, height: 1.7),
    ),
  );
  Map<String, dynamic> get slotQuery => {
    'experience': experience,
    'party': party,
    'date': date?.toIso8601String().substring(0, 10),
    'area': experience == 'Pub & Lounge' ? 'Lounge' : 'Indoor',
  };
  Future<void> chooseDate() async {
    final today = DateTime.now();
    final value = await showDatePicker(
      context: context,
      initialDate: date ?? today,
      firstDate: DateTime(today.year, today.month, today.day),
      lastDate: today.add(const Duration(days: 180)),
    );
    if (value != null) {
      setState(() {
        date = value;
        slots = [];
        time = '';
      });
    }
  }

  Widget booking() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      heading('A seat at our table.'),
      notice(
        'Local demonstration venue · bookings use actual database availability and are saved locally. They do not reserve a table at a real business. Times are Asia/Phnom_Penh (UTC+7).',
      ),
      DropdownButtonFormField<String>(
        isExpanded: true,
        initialValue: experience,
        decoration: const InputDecoration(labelText: 'Your experience'),
        items: [
          'Café',
          'Restaurant',
          'Pub & Lounge',
        ].map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
        onChanged: (s) => setState(() {
          experience = s!;
          slots = [];
          time = '';
        }),
      ),
      const SizedBox(height: 15),
      Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: busy ? null : chooseDate,
              icon: const Icon(Icons.calendar_today_outlined, size: 16),
              label: Text(
                date == null
                    ? 'Select a date'
                    : '${date!.day}/${date!.month}/${date!.year}',
              ),
            ),
          ),
          const SizedBox(width: 15),
          Expanded(
            child: DropdownButtonFormField<int>(
              isExpanded: true,
              initialValue: party,
              decoration: const InputDecoration(labelText: 'Guests'),
              items: List.generate(
                8,
                (i) => DropdownMenuItem(
                  value: i + 1,
                  child: Text(
                    '${i + 1} guests',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
              onChanged: (v) => setState(() {
                party = v!;
                slots = [];
                time = '';
              }),
            ),
          ),
        ],
      ),
      const SizedBox(height: 15),
      Text(
        'Seating: ${experience == 'Pub & Lounge' ? 'Lounge' : 'Indoor'}',
        style: const TextStyle(fontSize: 12),
      ),
      button(
        'FIND A TABLE',
        () => action(() async {
          if (date == null) throw Exception('Please select a date.');
          final response = await Api.request(
            '/availability',
            method: 'POST',
            data: slotQuery,
          );
          if (mounted) {
            setState(() {
              slots = response['slots'];
              message = slots.isEmpty
                  ? 'No tables are available for this selection. Try another date or party size.'
                  : 'Choose an available time below.';
            });
          }
        }),
      ),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: slots
            .map(
              (s) => ChoiceChip(
                label: Text(s['time']),
                selected: time == s['time'],
                onSelected: busy
                    ? null
                    : (_) => setState(() => time = s['time']),
              ),
            )
            .toList(),
      ),
      if (time.isNotEmpty) ...[
        heading('Make yourself at home.'),
        field('Name', name),
        field('Email', email),
        field('Phone', phone),
        field('Special requests', notes, required: false, lines: 3),
        button(
          'SAVE DEMONSTRATION RESERVATION',
          () => action(() async {
            if (!form.currentState!.validate()) return;
            final response = await Api.request(
              '/reservations',
              method: 'POST',
              data: {
                ...slotQuery,
                'time': time,
                'name': name.text,
                'email': email.text,
                'phone': phone.text,
                'notes': notes.text,
              },
            );
            if (mounted) {
              setState(() {
                result = response;
                slots = [];
                time = '';
              });
            }
          }),
        ),
      ],
      if (result != null) receipt(),
      const Divider(height: 50),
      heading('Find your reservation.'),
      field('Booking reference', reference, required: false),
      field('Booking access token', access, required: false),
      button(
        'RETRIEVE RESERVATION',
        () => action(() async {
          final value = await Api.request(
            '/reservations/${Uri.encodeComponent(reference.text.trim())}?access_token=${Uri.encodeComponent(access.text.trim())}',
          );
          if (mounted) setState(() => result = value);
        }),
      ),
      if (result is Map && result['id'] != null)
        button(
          'CANCEL THIS RESERVATION',
          () => action(() async {
            final value = await Api.request(
              '/reservations/${result['id']}',
              method: 'PATCH',
              data: {
                'access_token': result['access_token'] ?? access.text,
                'status': 'cancelled',
              },
            );
            if (mounted) setState(() => message = value['message']);
          }),
        ),
    ],
  );
  Widget receipt() =>
      notice(const JsonEncoder.withIndent('  ').convert(result));
  Widget accountPage() {
    if (Api.token == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          heading(registering ? 'A place for you.' : 'Welcome back.'),
          notice(
            'Accounts and records are stored on your local server. Email verification and reset delivery require a mail provider before production launch.',
          ),
          if (registering) field('Name', name),
          field('Email', email),
          field('Password', password, secret: true),
          button(
            registering ? 'CREATE ACCOUNT' : 'SIGN IN',
            () => action(() async {
              if (!form.currentState!.validate()) return;
              if (registering) {
                final value = await Api.request(
                  '/auth/register',
                  method: 'POST',
                  data: {
                    'name': name.text,
                    'email': email.text,
                    'password': password.text,
                  },
                );
                if (mounted) {
                  setState(() {
                    registering = false;
                    message = value['message'];
                  });
                }
              } else {
                final value = await Api.request(
                  '/auth/login',
                  method: 'POST',
                  data: {'email': email.text, 'password': password.text},
                );
                Api.token = value['token'];
                Api.user = Map<String, dynamic>.from(value['user']);
                name.text = Api.user!['name'];
                final me = await Api.request('/me');
                if (mounted) {
                  setState(() => account = Map<String, dynamic>.from(me));
                }
              }
            }),
          ),
          TextButton(
            onPressed: () => setState(() => registering = !registering),
            child: Text(
              registering
                  ? 'Already have an account? Sign in'
                  : 'New here? Create an account',
            ),
          ),
          TextButton(
            onPressed: () => action(() async {
              await Api.request(
                '/auth/reset',
                method: 'POST',
                data: {'email': email.text},
              );
            }),
            child: const Text('Reset password'),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        heading('Hello, ${Api.user?['name']}.'),
        if (account == null)
          button('LOAD MY ACCOUNT', loadAccount)
        else ...[
          field('Display name', name),
          button(
            'SAVE PROFILE',
            () => action(() async {
              final value = await Api.request(
                '/me',
                method: 'PATCH',
                data: {'name': name.text},
              );
              Api.user!['name'] = name.text;
              if (mounted) setState(() => message = value['message']);
            }),
          ),
          heading('My reservations'),
          if ((account!['reservations'] as List).isEmpty)
            const Text('Your next visit starts with a reservation.'),
          ...(account!['reservations'] as List).map(
            (r) => Card(
              child: ListTile(
                title: Text(
                  '${r['experience']} · ${r['date']} at ${r['time']}',
                ),
                subtitle: Text(
                  '${r['id']} · ${r['party']} guests · ${r['status']}',
                ),
                trailing: r['status'] == 'confirmed'
                    ? IconButton(
                        tooltip: 'Cancel reservation',
                        icon: const Icon(Icons.close),
                        onPressed: () => action(() async {
                          await Api.request(
                            '/reservations/${r['id']}',
                            method: 'PATCH',
                            data: {'status': 'cancelled'},
                          );
                          final me = await Api.request('/me');
                          if (mounted) {
                            setState(
                              () => account = Map<String, dynamic>.from(me),
                            );
                          }
                        }),
                      )
                    : null,
              ),
            ),
          ),
          heading('My orders'),
          if ((account!['orders'] as List).isEmpty)
            const Text('No orders yet.'),
          ...(account!['orders'] as List).map(
            (o) => Card(
              child: ListTile(
                title: Text(
                  '${o['id']} · \$${(o['total'] / 100).toStringAsFixed(2)}',
                ),
                subtitle: Text(
                  '${o['status']} · ${o['payment_status']} · ${o['table_id'] ?? 'Pickup'}',
                ),
                onTap: () => action(() async {
                  final value = await Api.request('/orders/${o['id']}');
                  if (mounted) setState(() => result = value);
                }),
              ),
            ),
          ),
          if (result != null) receipt(),
        ],
        const SizedBox(height: 20),
        button(
          'SIGN OUT',
          () => action(() async {
            await Api.request('/auth/logout', method: 'POST');
            Api.token = null;
            Api.user = null;
            if (mounted) setState(() => account = null);
          }),
        ),
        const SizedBox(height: 20),
        ExpansionTile(
          title: const Text('Delete account'),
          children: [
            field('Confirm password', password, secret: true),
            button(
              'PERMANENTLY DELETE ACCOUNT',
              () => action(() async {
                final value = await Api.request(
                  '/me',
                  method: 'DELETE',
                  data: {'password': password.text},
                );
                Api.token = null;
                Api.user = null;
                if (mounted) {
                  setState(() {
                    account = null;
                    message = value['message'];
                  });
                }
              }),
            ),
          ],
        ),
      ],
    );
  }

  Widget checkout() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      heading('Something good to go.'),
      notice(
        'Demonstration order · no payment is collected and no real kitchen is notified. Prices and availability are validated on the server before saving.',
      ),
      field('Name', name),
      field('Email', email),
      field('Order notes', notes, required: false, lines: 3),
      button(
        'SUBMIT DEMONSTRATION ORDER',
        () => action(() async {
          if (!form.currentState!.validate()) return;
          if (widget.order == null) throw Exception('Your bag is empty.');
          final value = await Api.request(
            '/orders',
            method: 'POST',
            data: {
              ...widget.order!,
              'request_key': requestKey,
              'name': name.text,
              'email': email.text,
              'notes': notes.text,
            },
          );
          if (mounted) setState(() => result = value);
          widget.onOrdered?.call();
        }),
      ),
      if (result != null) receipt(),
      heading('Track an order'),
      field('Order reference', reference, required: false),
      field('Order access token', access, required: false),
      button(
        'LOOK UP ORDER',
        () => action(() async {
          final value = await Api.request(
            '/orders/${Uri.encodeComponent(reference.text)}?access_token=${Uri.encodeComponent(access.text)}',
          );
          if (mounted) setState(() => result = value);
        }),
      ),
    ],
  );
  Widget adminPage() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      heading('Behind the house.'),
      if (Api.token == null)
        notice(
          'Sign in through Account with a staff account. Create the first administrator from the terminal: python server/app.py --create-admin your@email.com',
        )
      else ...[
        button('REFRESH OPERATIONS', loadAdmin),
        if (admin != null) ...[
          notice(
            'Today: ${admin!['today_reservations']} reservations · ${admin!['today_guests']} guests\nVerified sales: \$0.00 · no payment provider connected. All records belong to the demonstration venue.',
          ),
          heading('Reservations'),
          ...(admin!['reservations'] as List).map(
            (r) => Card(
              child: ListTile(
                title: Text('${r['name']} · ${r['party']} guests'),
                subtitle: Text(
                  '${r['id']} · ${r['date']} ${r['time']} · ${r['status']}',
                ),
                trailing: PopupMenuButton<String>(
                  onSelected: (v) => action(() async {
                    await Api.request(
                      '/reservations/${r['id']}',
                      method: 'PATCH',
                      data: {'status': v},
                    );
                    final value = await Api.request('/admin/overview');
                    if (mounted) {
                      setState(() => admin = Map<String, dynamic>.from(value));
                    }
                  }),
                  itemBuilder: (_) =>
                      [
                            'pending',
                            'confirmed',
                            'cancelled',
                            'completed',
                            'no-show',
                          ]
                          .map((s) => PopupMenuItem(value: s, child: Text(s)))
                          .toList(),
                ),
              ),
            ),
          ),
          heading('Orders'),
          ...(admin!['orders'] as List).map(
            (o) => Card(
              child: ListTile(
                title: Text('${o['id']} · ${o['name']}'),
                subtitle: Text(
                  '${o['status']} · ${o['payment_status']} · ${o['table_id'] ?? 'Pickup'}',
                ),
                trailing: PopupMenuButton<String>(
                  onSelected: (v) => action(() async {
                    await Api.request(
                      '/orders/${o['id']}',
                      method: 'PATCH',
                      data: {'status': v},
                    );
                    final value = await Api.request('/admin/overview');
                    if (mounted) {
                      setState(() => admin = Map<String, dynamic>.from(value));
                    }
                  }),
                  itemBuilder: (_) =>
                      [
                            'accepted',
                            'rejected',
                            'preparing',
                            'ready',
                            'completed',
                            'cancelled',
                          ]
                          .map((s) => PopupMenuItem(value: s, child: Text(s)))
                          .toList(),
                ),
              ),
            ),
          ),
          if (Api.user?['role'] != 'staff') ...[
            heading('Menu management'),
            ...(admin!['menu'] as List).map(
              (m) => Card(
                child: ListTile(
                  title: Text(
                    '${m['name']} · \$${(m['price'] / 100).toStringAsFixed(2)}',
                  ),
                  subtitle: Text(
                    m['available'] == 1 ? 'Available' : 'Archived',
                  ),
                  trailing: IconButton(
                    tooltip: 'Edit menu item',
                    icon: const Icon(Icons.edit_outlined),
                    onPressed: () => editJson(
                      'Menu item',
                      '/admin/menu',
                      Map<String, dynamic>.from(m),
                    ),
                  ),
                ),
              ),
            ),
            button(
              'ADD MENU ITEM',
              () => editJson('New menu item', '/admin/menu', {
                'id': 'new-item',
                'name': 'New dish',
                'category': 'Main Courses',
                'experience': 'Restaurant',
                'image': 'restaurant',
                'price': 1500,
                'description': 'Describe the dish.',
                'allergens': '',
                'vegetarian': false,
                'available': true,
              }),
            ),
            heading('Events management'),
            ...(admin!['events'] as List).map(
              (e) => ListTile(
                title: Text(e['title']),
                subtitle: Text('${e['date']} · ${e['status']}'),
                trailing: IconButton(
                  tooltip: 'Edit event',
                  icon: const Icon(Icons.edit),
                  onPressed: () => editJson(
                    'Event',
                    '/admin/events',
                    Map<String, dynamic>.from(e),
                  ),
                ),
              ),
            ),
            button(
              'CREATE EVENT',
              () => editJson('New event', '/admin/events', {
                'id': 'event-${DateTime.now().millisecondsSinceEpoch}',
                'title': 'New experience',
                'description': 'Describe your event.',
                'date': DateTime.now()
                    .add(const Duration(days: 7))
                    .toIso8601String()
                    .substring(0, 10),
                'time': '18:00',
                'capacity': 20,
                'status': 'draft',
              }),
            ),
            heading('Venue settings'),
            button(
              'EDIT VENUE CONFIGURATION',
              () => editJson(
                'Venue settings',
                '/admin/settings',
                Map<String, dynamic>.from(admin!['settings'])..remove('demo'),
              ),
            ),
            button(
              'BLOCK A DATE',
              () => editJson('Closed date', '/admin/blocks', {
                'date': DateTime.now()
                    .add(const Duration(days: 1))
                    .toIso8601String()
                    .substring(0, 10),
                'blocked': true,
              }),
            ),
            ExpansionTile(
              title: const Text('Audit history'),
              children: [
                notice(
                  const JsonEncoder.withIndent('  ').convert(admin!['audit']),
                ),
              ],
            ),
          ],
        ],
      ],
    ],
  );
  Future<void> editJson(
    String title,
    String endpoint,
    Map<String, dynamic> data,
  ) async {
    final editor = TextEditingController(
      text: const JsonEncoder.withIndent('  ').convert(data),
    );
    String? error;
    if (endpoint == '/admin/menu') {
      data['vegetarian'] =
          data['vegetarian'] == 1 || data['vegetarian'] == true;
      data['available'] = data['available'] == 1 || data['available'] == true;
      editor.text = const JsonEncoder.withIndent('  ').convert(data);
    }
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialog) => AlertDialog(
          title: Text(title),
          content: SizedBox(
            width: 600,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Prices are integer USD cents. Image names refer to bundled assets.',
                    style: TextStyle(fontSize: 11),
                  ),
                  TextField(
                    controller: editor,
                    minLines: 10,
                    maxLines: 20,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                    ),
                  ),
                  if (error != null)
                    Text(error!, style: const TextStyle(color: Colors.red)),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                try {
                  final payload = Map<String, dynamic>.from(
                    jsonDecode(editor.text),
                  );
                  await Api.request(
                    endpoint,
                    method: endpoint == '/admin/settings' ? 'PATCH' : 'POST',
                    data: payload,
                  );
                  if (context.mounted) Navigator.pop(context, true);
                } catch (e) {
                  setDialog(() => error = e.toString());
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    // The dialog's exit animation may still read its controller.
    if (saved == true) {
      widget.onMenuChanged?.call();
      await loadAdmin();
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 45),
    child: Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: widget.page == 'Admin' ? 1000 : 680,
        ),
        child: Form(
          key: form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              switch (widget.page) {
                'Reservations' => booking(),
                'Account' => accountPage(),
                'Checkout' => checkout(),
                'Admin' => adminPage(),
                _ => const SizedBox.shrink(),
              },
              if (busy)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: LinearProgressIndicator(),
                ),
              if (message.isNotEmpty)
                Semantics(liveRegion: true, child: notice(message)),
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    ),
  );
}
