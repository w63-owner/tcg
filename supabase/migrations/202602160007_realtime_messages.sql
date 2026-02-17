-- Enable Realtime for messaging tables

do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception
    when duplicate_object then
      null;
  end;

  begin
    alter publication supabase_realtime add table public.conversations;
  exception
    when duplicate_object then
      null;
  end;
end;
$$;
