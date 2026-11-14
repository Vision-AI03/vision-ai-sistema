-- Projeto: Sistem Central - Vision AI (sfezwprbanvxsnwgvkhh)
-- Bucket público com as imagens da fila_posts. A Graph API do Instagram baixa a mídia
-- pela URL, então a leitura precisa ser pública; escrita só do dono.
-- Limites do Instagram: JPEG, até 8 MB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posts', 'posts', true, 8388608, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists posts_somente_dono on storage.objects;
create policy posts_somente_dono on storage.objects
  for all
  to authenticated
  using (bucket_id = 'posts' and (select e_dono()))
  with check (bucket_id = 'posts' and (select e_dono()));
