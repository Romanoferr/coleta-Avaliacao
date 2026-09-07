-- ============================================================================
-- seed.sql - dados 100% FICTÍCIOS para desenvolvimento manual.
-- Roda via `supabase db reset` (local). Nunca usar em produção.
-- Atribui tudo ao usuário mais antigo (auth.users); sem usuário, avisa e
-- não insere nada (owner_id é obrigatório).
-- ============================================================================

DO $$
DECLARE
  dev_id uuid;
BEGIN
  SELECT id INTO dev_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF dev_id IS NULL THEN
    RAISE NOTICE 'seed ignorado: crie um usuário primeiro (docs/SUPABASE.md)';
    RETURN;
  END IF;

  INSERT INTO orders (id, owner_id, number, contractor, received_date, inspection_date, inspection_time, due_date, address, contact_name, contact_phone, notes, status, status_history)
  VALUES
    ('11111111-1111-4111-8111-111111111111', dev_id, '1001', 'Banco Exemplo', CURRENT_DATE - 6, CURRENT_DATE, '09:30', CURRENT_DATE + 8,
     '{"street": "Rua das Flores", "number": "123", "district": "Centro", "city": "Londrina", "state": "PR"}',
     'Maria Silva', '(43) 99999-0001', 'Seed fictício - OS com ficha', 'inspected',
     '[{"from": "received", "to": "received", "at": "2026-09-01T10:00:00Z", "note": "OS criada"}, {"from": "received", "to": "scheduled", "at": "2026-09-02T10:00:00Z"}, {"from": "scheduled", "to": "inspected", "at": "2026-09-03T10:00:00Z"}]'),
    ('22222222-2222-4222-8222-222222222222', dev_id, '1002', 'Cliente Fictício', CURRENT_DATE - 1, CURRENT_DATE + 1, '14:00', CURRENT_DATE + 10,
     '{"street": "Av. Paraná", "number": "456", "city": "Londrina", "state": "PR"}',
     'João Souza', '(43) 99999-0002', 'Seed fictício - OS sem ficha', 'scheduled',
     '[{"from": "received", "to": "received", "at": "2026-09-06T10:00:00Z", "note": "OS criada"}, {"from": "received", "to": "scheduled", "at": "2026-09-06T11:00:00Z"}]'),
    ('33333333-3333-4333-8333-333333333333', dev_id, '1003', 'Banco Exemplo', CURRENT_DATE - 20, CURRENT_DATE - 5, '10:00', CURRENT_DATE - 2,
     '{"raw": "Sítio próximo à rodovia, km 12"}',
     NULL, NULL, 'Seed fictício - OS atrasada', 'received',
     '[{"from": "received", "to": "received", "at": "2026-08-20T10:00:00Z", "note": "OS criada"}]')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO inspections (id, order_id, owner_id, property_type, status, schema_version, form_version, current_section, data, started_at)
  VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', dev_id, 'apartment', 'draft', 1, 1, 0,
     '{"identificacao": {"data": "2026-09-07", "cliente": "Maria Silva"}}', now() - interval '2 days')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO documents (id, order_id, owner_id, name, kind, storage_status)
  VALUES
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', dev_id, 'Matrícula do imóvel', 'matricula', 'pending_storage')
  ON CONFLICT (id) DO NOTHING;
END;
$$;
