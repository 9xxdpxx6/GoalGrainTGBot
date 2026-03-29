-- 1. D1 / D7 retention по таблице logs
WITH first_register AS (
  SELECT
    user_id,
    MIN(timestamp)::date AS signup_date
  FROM logs
  WHERE action_type = 'REGISTER'
  GROUP BY user_id
),
activity AS (
  SELECT DISTINCT
    user_id,
    timestamp::date AS activity_date
  FROM logs
)
SELECT
  signup_date,
  COUNT(*) AS signups,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1
      FROM activity a
      WHERE a.user_id = fr.user_id
        AND a.activity_date = fr.signup_date + INTERVAL '1 day'
    )
  ) AS retained_d1,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1
      FROM activity a
      WHERE a.user_id = fr.user_id
        AND a.activity_date = fr.signup_date + INTERVAL '7 day'
    )
  ) AS retained_d7
FROM first_register fr
GROUP BY signup_date
ORDER BY signup_date DESC;

-- 2. Какие приемы пищи чаще попадают в сгенерированные рационы
SELECT
  meal->>'mealKey' AS meal_key,
  meal->>'mealName' AS meal_name,
  meal->>'slot' AS slot,
  COUNT(*) AS generated_count
FROM logs l
CROSS JOIN LATERAL jsonb_array_elements(l.output_data->'plan'->'meals') AS meal
WHERE l.action_type = 'GENERATE_DAY'
GROUP BY meal->>'mealKey', meal->>'mealName', meal->>'slot'
ORDER BY generated_count DESC, meal_name;

-- 3. Какие приемы пищи чаще заменяются
WITH regen AS (
  SELECT
    input_data->>'slot' AS slot,
    (
      SELECT prev_meal->>'mealKey'
      FROM jsonb_array_elements(input_data->'previousPlan'->'meals') AS prev_meal
      WHERE prev_meal->>'slot' = input_data->>'slot'
      LIMIT 1
    ) AS previous_meal_key,
    (
      SELECT prev_meal->>'mealName'
      FROM jsonb_array_elements(input_data->'previousPlan'->'meals') AS prev_meal
      WHERE prev_meal->>'slot' = input_data->>'slot'
      LIMIT 1
    ) AS previous_meal_name,
    (
      SELECT new_meal->>'mealKey'
      FROM jsonb_array_elements(output_data->'plan'->'meals') AS new_meal
      WHERE new_meal->>'slot' = input_data->>'slot'
      LIMIT 1
    ) AS next_meal_key,
    (
      SELECT new_meal->>'mealName'
      FROM jsonb_array_elements(output_data->'plan'->'meals') AS new_meal
      WHERE new_meal->>'slot' = input_data->>'slot'
      LIMIT 1
    ) AS next_meal_name
  FROM logs
  WHERE action_type = 'REGENERATE_MEAL'
)
SELECT
  slot,
  previous_meal_key,
  previous_meal_name,
  next_meal_key,
  next_meal_name,
  COUNT(*) AS replacements
FROM regen
GROUP BY slot, previous_meal_key, previous_meal_name, next_meal_key, next_meal_name
ORDER BY replacements DESC, slot;

-- 4. Где пользователи отваливаются при регистрации / редактировании профиля
SELECT
  action_type,
  input_data->>'step' AS step,
  output_data->>'status' AS status,
  COUNT(*) AS events
FROM logs
WHERE action_type IN ('REGISTER', 'EDIT_PROFILE')
GROUP BY action_type, input_data->>'step', output_data->>'status'
ORDER BY action_type, step, status;

-- 5. Частота ошибок валидации по шагам onboarding
SELECT
  input_data->>'step' AS step,
  COUNT(*) AS validation_errors
FROM logs
WHERE action_type IN ('REGISTER', 'EDIT_PROFILE')
  AND output_data->>'status' = 'validation_error'
GROUP BY input_data->>'step'
ORDER BY validation_errors DESC;

-- 6. Насколько часто пользователи включают джанк-фуд
SELECT
  COALESCE(output_data->>'updatedValue', output_data->'profile'->>'allowJunkFood') AS allow_junk_food,
  COUNT(*) AS events
FROM logs
WHERE action_type = 'EDIT_PROFILE'
  AND (
    input_data->>'source' = 'toggle_junk_food'
    OR input_data->>'step' = 'junk'
  )
GROUP BY COALESCE(output_data->>'updatedValue', output_data->'profile'->>'allowJunkFood')
ORDER BY events DESC;
