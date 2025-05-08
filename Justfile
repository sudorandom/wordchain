all $date='':
    just expand-dictionary
    just gen-normal ${date}
    just gen-hard ${date}
    just gen-impossible ${date}

gen-normal $date='':
  go run ./cmd/generate-map \
    --grid-rows=3 \
    --grid-cols=4 \
    --word-length=4 \
    --min-turns=7 \
    --max-turns=10 \
    --max-unique-words=12 \
    --num-grids=100 \
    --output=frontend/public/levels/normal \
    --start-date=${date}

gen-hard $date='':
  go run ./cmd/generate-map \
    --grid-rows=4 \
    --grid-cols=4 \
    --word-length=4 \
    --min-turns=6 \
    --max-turns=9 \
    --max-unique-words=10 \
    --num-grids=100 \
    --output=frontend/public/levels/hard \
    --start-date=${date}

gen-impossible $date='':
  go run ./cmd/generate-map \
    --grid-rows=5 \
    --grid-cols=5 \
    --word-length=5 \
    --min-turns=10 \
    --max-turns=20 \
    --max-unique-words=20 \
    --num-grids=100 \
    --output=frontend/public/levels/impossible \
    --start-date=${date}

expand-dictionary:
  unmunch cmd/generate-map/data/en.dic cmd/generate-map/data/en.aff > cmd/generate-map/data/en.txt
