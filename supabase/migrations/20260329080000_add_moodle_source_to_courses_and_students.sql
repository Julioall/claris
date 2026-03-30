-- Adiciona coluna moodle_source em courses e students para suporte a múltiplas
-- origens de sincronização Moodle (ex: 'goias', 'nacional').
-- O valor padrão 'goias' garante retrocompatibilidade com registros existentes.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS moodle_source TEXT NOT NULL DEFAULT 'goias';

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS moodle_source TEXT NOT NULL DEFAULT 'goias';
