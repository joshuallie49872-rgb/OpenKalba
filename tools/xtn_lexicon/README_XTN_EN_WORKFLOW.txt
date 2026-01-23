XTN English Gloss Workflow (LOCKED CORE)

1) Copy the CSV into your repo:
   tools\xtn_lexicon\xtn_es_to_en_review.csv

   (rename xtn_es_to_en_review_LOCKED144.csv -> xtn_es_to_en_review.csv)

2) Fill the 'en' column in Excel (leave xtn + es unchanged).

3) Run:
   py tools\xtn_lexicon\apply_xtn_en_glosses.py

Output:
   tools\xtn_lexicon\xtn_en_core_locked.csv
