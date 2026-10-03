-- Preserve ZeroStorage as the canonical identity for imported model images.
alter table public.models
  add column if not exists profile_image_zerostorage_file_id text;

comment on column public.models.profile_image_zerostorage_file_id is
  'Canonical ZeroStorage file ID for the model profile image; the display URL is derived at runtime.';