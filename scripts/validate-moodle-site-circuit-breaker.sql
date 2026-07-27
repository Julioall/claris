BEGIN;

DO $$
DECLARE
  v_fieg UUID := 'f7c320d5-1c39-4d69-906d-42289f6b92a4';
  v_senai UUID := 'b09deea6-fb9f-4318-b2a6-981881512db4';
  v_fieg_state JSONB;
  v_senai_state JSONB;
BEGIN
  PERFORM public.backend_record_moodle_site_circuit_result(v_fieg, FALSE, 'moodle_server_error');
  PERFORM public.backend_record_moodle_site_circuit_result(v_fieg, FALSE, 'moodle_server_error');
  v_fieg_state := public.backend_record_moodle_site_circuit_result(v_fieg, FALSE, 'moodle_server_error');
  v_senai_state := public.backend_record_moodle_site_circuit_result(v_senai, TRUE, NULL);

  IF v_fieg_state ->> 'state' <> 'open'
    OR (v_fieg_state ->> 'consecutive_failures')::INTEGER < 3
    OR v_fieg_state ->> 'open_until' IS NULL THEN
    RAISE EXCEPTION 'FIEG circuit did not open after three transient failures: %', v_fieg_state;
  END IF;

  IF v_senai_state ->> 'state' <> 'closed'
    OR (v_senai_state ->> 'consecutive_failures')::INTEGER <> 0 THEN
    RAISE EXCEPTION 'SENAI circuit was not independently kept closed: %', v_senai_state;
  END IF;

  v_fieg_state := public.backend_record_moodle_site_circuit_result(v_fieg, TRUE, NULL);
  IF v_fieg_state ->> 'state' <> 'closed'
    OR (v_fieg_state ->> 'consecutive_failures')::INTEGER <> 0 THEN
    RAISE EXCEPTION 'Successful FIEG result did not close the circuit: %', v_fieg_state;
  END IF;

  RAISE NOTICE 'Moodle site circuit breaker integration passed';
END $$;

ROLLBACK;
