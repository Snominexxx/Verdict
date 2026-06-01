alter table public.legal_packs
	add column if not exists language text not null default 'en';

do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'legal_packs_language_check'
	) then
		alter table public.legal_packs
			add constraint legal_packs_language_check
			check (language in ('en', 'fr'));
	end if;
end $$;
