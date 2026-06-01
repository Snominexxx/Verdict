alter table public.cases
	alter column court_type set default 'bench';

alter table public.staged_cases
	alter column court_type set default 'bench';

update public.cases
set court_type = 'bench'
where court_type <> 'bench';

update public.staged_cases
set court_type = 'bench'
where court_type <> 'bench';