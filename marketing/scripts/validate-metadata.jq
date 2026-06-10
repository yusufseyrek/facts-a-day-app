.ios.locales | to_entries[] | . as $e |
[
  $e.key,
  ($e.value.name | length),
  ($e.value.subtitle | length),
  ($e.value.keywords | length),
  ($e.value.promotionalText | length),
  ($e.value.description | length),
  ($e.value | keys | length),
  (if ($e.value.name | length) > 30 then "NAME_OVER" else "" end) +
  (if ($e.value.subtitle | length) > 30 then " SUB_OVER" else "" end) +
  (if ($e.value.keywords | length) > 100 then " KW_OVER" else "" end) +
  (if ($e.value.promotionalText | length) > 170 then " PROMO_OVER" else "" end) +
  (if ($e.value.description | length) > 4000 then " DESC_OVER" else "" end) +
  (if ($e.value | keys | length) == 6 then "" else " FIELDS_BAD" end)
] | map(if . == "" then "ok" else (. | tostring) end) | @tsv
