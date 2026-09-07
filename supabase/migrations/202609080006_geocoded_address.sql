-- ============================================================================
-- 00006_geocoded_address — invalidação do cache de coordenadas
-- ============================================================================
-- `orders.geo` (00005) só é reutilizado quando `geocoded_address` coincide
-- com a chave normalizada do endereço atual da OS. Se o endereço mudar, a
-- coordenada é considerada obsoleta e a OS é geocodificada de novo.
-- Formato da chave: minúsculas, sem acento/pontuação, espaços colapsados
-- (ver routeOptimizer/geo.ts → addressKey). RLS: mesma policy da tabela.
-- ============================================================================

ALTER TABLE orders ADD COLUMN geocoded_address text NULL
  CHECK (geocoded_address IS NULL OR char_length(geocoded_address) BETWEEN 1 AND 500);
