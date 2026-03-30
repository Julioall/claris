-- Remove coluna moodle_source de courses e students.
-- A feature de multiplas origens Moodle foi descartada; o sistema usa
-- exclusivamente https://ead.fieg.com.br como unica fonte de sincronizacao.

ALTER TABLE public.courses
  DROP COLUMN IF EXISTS moodle_source;

ALTER TABLE public.students
  DROP COLUMN IF EXISTS moodle_source;
