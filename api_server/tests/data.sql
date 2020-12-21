INSERT INTO admin_user (username, password)
VALUES
  ('test', 'pbkdf2:sha256:50000$TCI4GzcX$0de171a4f4dac32e3364c7ddc7c14f3e2fa61f2d17574483f7ffbb431b4acb2f'),
  ('other', 'pbkdf2:sha256:50000$kJPKsz6N$d2d4784f1b030a9761f5ccaeeaca413f27f2ecb76d6168407af962ddce849f79');


INSERT INTO user (email, password)
VALUES
  ('Test@Test.Test', 'pbkdf2:sha256:50000$TCI4GzcX$0de171a4f4dac32e3364c7ddc7c14f3e2fa61f2d17574483f7ffbb431b4acb2f'),
  ('other@test.test', 'pbkdf2:sha256:50000$kJPKsz6N$d2d4784f1b030a9761f5ccaeeaca413f27f2ecb76d6168407af962ddce849f79');


INSERT INTO profile (user_id, name, host, port)
VALUES (
  (SELECT id FROM user WHERE email = 'Test@Test.Test'),
  'My profile 1',
  'somehost1.com',
  1234
);

INSERT INTO profile (user_id, name, host, port, config)
VALUES (
  (SELECT id FROM user WHERE email = 'Test@Test.Test'),
  'My profile 2',
  'somehost2.com',
  1235,
  '{"some": "config"}'
);

INSERT INTO profile (user_id, name, host, port)
VALUES (
  (SELECT id FROM user WHERE email = 'other@test.test'),
  'Other profile 1',
  'otherhost1.com',
  4321
);

INSERT INTO profile (user_id, name, host, port, config)
VALUES (
  (SELECT id FROM user WHERE email = 'other@test.test'),
  'Other profile 2',
  'otherhost2.com',
  4320,
  '{"someother": "otherconfig"}'
);
