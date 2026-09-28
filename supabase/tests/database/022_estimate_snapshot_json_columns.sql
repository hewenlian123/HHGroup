begin;

select plan(12);

select has_column(
  'public',
  'estimate_snapshots',
  'meta_json',
  'estimate snapshots persist meta_json'
);
select col_type_is(
  'public',
  'estimate_snapshots',
  'meta_json',
  'jsonb',
  'meta_json is jsonb'
);
select col_not_null(
  'public',
  'estimate_snapshots',
  'meta_json',
  'meta_json is required'
);
select col_has_default(
  'public',
  'estimate_snapshots',
  'meta_json',
  'meta_json has a default'
);

select has_column(
  'public',
  'estimate_snapshots',
  'items_json',
  'estimate snapshots persist items_json'
);
select col_type_is(
  'public',
  'estimate_snapshots',
  'items_json',
  'jsonb',
  'items_json is jsonb'
);
select col_not_null(
  'public',
  'estimate_snapshots',
  'items_json',
  'items_json is required'
);
select col_has_default(
  'public',
  'estimate_snapshots',
  'items_json',
  'items_json has a default'
);

select has_column(
  'public',
  'estimate_snapshots',
  'summary_json',
  'estimate snapshots persist summary_json'
);
select col_type_is(
  'public',
  'estimate_snapshots',
  'summary_json',
  'jsonb',
  'summary_json is jsonb'
);
select col_not_null(
  'public',
  'estimate_snapshots',
  'summary_json',
  'summary_json is required'
);
select col_has_default(
  'public',
  'estimate_snapshots',
  'summary_json',
  'summary_json has a default'
);

select * from finish();
rollback;
