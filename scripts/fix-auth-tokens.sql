-- Lagar handvirkt stofnaða auth.users: GoTrue vill tóma strengi ('') í token-dálkum,
-- ekki NULL. Setur '' í þá dálka sem eru til og eru NULL.
do $$
declare
  col  text;
  cols text[] := array[
    'confirmation_token','recovery_token','email_change_token_new','email_change',
    'email_change_token_current','phone_change','phone_change_token',
    'reauthentication_token'
  ];
begin
  foreach col in array cols loop
    if exists (
      select 1 from information_schema.columns
      where table_schema='auth' and table_name='users' and column_name=col
    ) then
      execute format('update auth.users set %I = '''' where %I is null', col, col);
    end if;
  end loop;
end $$;
