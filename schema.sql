-- LogiRotator / Neon PostgreSQL
-- Execute este arquivo no SQL Editor do Neon antes de usar o sistema.
CREATE TABLE IF NOT EXISTS colaboradores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL,
 escala text DEFAULT '6x1', dsr text DEFAULT 'Domingo',
 horario text DEFAULT '00:00 - 07:54', codigo_spx text, codigo text, spx text,
 matricula text, email text, ops_id text, cargo text, funcao text, contrato text,
 station text, hub text, sub_regional text, ativo boolean DEFAULT true,
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS presenca_diaria (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
 data date NOT NULL, status text NOT NULL, created_at timestamptz DEFAULT now(),
 UNIQUE (colaborador_id, data)
);
CREATE INDEX IF NOT EXISTS idx_presenca_data ON presenca_diaria(data);
CREATE INDEX IF NOT EXISTS idx_presenca_colaborador ON presenca_diaria(colaborador_id);
CREATE TABLE IF NOT EXISTS historico_escala (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
 data date, data_inicio date NOT NULL, data_fim date, setor text, funcao text,
 escala text, turno text, hora_inicio time, hora_fim time, created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_historico_data_inicio ON historico_escala(data_inicio);
CREATE INDEX IF NOT EXISTS idx_historico_colaborador ON historico_escala(colaborador_id);
CREATE TABLE IF NOT EXISTS logirotator_diaristas_diarios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), data date NOT NULL UNIQUE,
 pedidos integer NOT NULL DEFAULT 0, presentes integer NOT NULL DEFAULT 0,
 faltantes integer NOT NULL DEFAULT 0, updated_by uuid,
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS logirotator_perfis (
 user_id uuid PRIMARY KEY, nome text NOT NULL, email text NOT NULL UNIQUE,
 papel text NOT NULL DEFAULT 'usuario', ativo boolean NOT NULL DEFAULT true,
 created_at timestamptz DEFAULT now()
);
