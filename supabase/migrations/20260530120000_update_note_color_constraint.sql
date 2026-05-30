-- notes.color CHECK 제약 업데이트
-- 기존: ('default','yellow','blue','green','pink','purple')
-- 신규: 9가지 색상 + default(레거시 하위호환)

ALTER TABLE notes
  DROP CONSTRAINT IF EXISTS notes_color_check;

ALTER TABLE notes
  ADD CONSTRAINT notes_color_check
  CHECK (color IN (
    'default',  -- 레거시 하위호환
    'yellow', 'orange', 'red', 'pink', 'purple',
    'blue', 'teal', 'green', 'gray'
  ));

-- 기존 'default' → 'yellow' 일괄 변환
UPDATE notes SET color = 'yellow' WHERE color = 'default';
