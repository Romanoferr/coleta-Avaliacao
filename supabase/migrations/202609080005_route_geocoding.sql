-- ============================================================================
-- 00005_route_geocoding - cache de coordenadas por OS (Otimizador de Rotas)
-- ============================================================================
-- Decisão: o cache PRIMÁRIO é o geocache em localStorage (chave = endereço
-- normalizado), que funciona nos dois backends (Supabase e modo local) sem
-- tráfego extra. Estas colunas são o cache SERVIDOR: permitem persistir o
-- resultado da geocodificação (Nominatim) na OS e nunca re-geocodificar uma
-- OS já localizada - mesmo em outro aparelho.
--
-- RLS: colunas da tabela orders, já cobertas pela policy owner_all_orders.
-- Nulo = ainda não geocodificada. O app preenche via OrderPatch futuro;
-- nenhum fluxo existente é afetado (colunas NULLABLE sem default).
-- ============================================================================

ALTER TABLE orders ADD COLUMN latitude double precision NULL
  CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90));
ALTER TABLE orders ADD COLUMN longitude double precision NULL
  CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180));
ALTER TABLE orders ADD COLUMN geocoded_at timestamptz NULL;

-- Coordenadas andam juntas: impede meia-gravação (só lat sem lng).
ALTER TABLE orders ADD CONSTRAINT orders_geo_pair
  CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL)
  );
