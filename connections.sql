create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists connections_sender_id_idx on public.connections(sender_id);
create index if not exists connections_receiver_id_idx on public.connections(receiver_id);
create index if not exists connections_status_idx on public.connections(status);
