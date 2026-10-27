/* Подключение к Supabase. Сюда вставляются два публичных значения проекта:
   Dashboard -> Project Settings -> API -> Project URL и anon (publishable) key.
   Эти значения безопасно хранить в клиентском коде, доступ защищён правилами из supabase/schema.sql.
   Пока поля пустые, вкладки «Загрузить» и «Слушать» показывают, что облако не подключено. */
self.MASHAPER_SUPABASE = {
  url: 'https://ziwobqlqlpejlakdwyjw.supabase.co',
  anonKey: 'sb_publishable_YRbCJdeiwfafMRj_cokd3g_64l6P9-w',
};
