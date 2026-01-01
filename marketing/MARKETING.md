# Facts a Day - App Store Marketing

## 📦 Config Files & Upload Scripts

### Metadata Config
All app store metadata is stored in `marketing/config/metadata.json` for easy management and automated uploads.

### Upload Scripts

**Screenshots:**
```bash
# Upload screenshots to App Store Connect
./marketing/scripts/upload.sh --ios

# Upload screenshots to Google Play
./marketing/scripts/upload.sh --android

# Preview without uploading
./marketing/scripts/upload.sh --ios --dry-run
```

**Metadata (titles, descriptions, keywords):**
```bash
# Upload metadata to App Store Connect
./marketing/scripts/upload-metadata.sh --ios

# Upload metadata to Google Play
./marketing/scripts/upload-metadata.sh --android

# Upload to both stores
./marketing/scripts/upload-metadata.sh --all

# Upload specific locale only
./marketing/scripts/upload-metadata.sh --ios --locale de

# Preview without uploading
./marketing/scripts/upload-metadata.sh --ios --dry-run
```

### Authentication Setup

**App Store Connect (iOS):**
```bash
export ASC_KEY_ID="YOUR_KEY_ID"
export ASC_ISSUER_ID="YOUR_ISSUER_ID"
export ASC_KEY_PATH="/path/to/AuthKey_XXXXX.p8"
```

**Google Play (Android):**
```bash
export GOOGLE_PLAY_JSON_KEY="/path/to/service-account.json"
```

---

## 🇺🇸 English (en)

### App Name (30 chars max)
```
Facts a Day - Daily Trivia
```

### Subtitle (30 chars max)
```
Learn · Quiz · Get Smarter
```

### Short Description (80 chars - Google Play)
```
Discover fascinating facts daily and test your knowledge with fun trivia games.
```

### Promotional Text (170 chars - iOS)
```
🧠 New facts every day! Expand your knowledge, challenge yourself with trivia, and become the smartest person in the room. Pick your favorite topics and start learning.
```

### Keywords (100 chars - iOS)
```
facts,trivia,quiz,daily,learn,knowledge,brain,game,interesting,educational,science,history
```

### Description (4000 chars max)
```
Discover something new every day!

Facts a Day brings you fascinating facts from science, history, nature, and more — delivered daily with beautiful visuals. Test what you've learned with fun trivia games and track your progress.

WHY YOU'LL LOVE IT

• Daily Facts Feed — Fresh, interesting facts every day
• Beautiful Cards — Each fact comes with a stunning image
• Smart Trivia — 3 game modes to test your knowledge
• Your Topics — Choose categories that interest you
• Track Progress — See your stats, streaks, and accuracy
• Save Favorites — Build your personal fact collection
• 8 Languages — Available in English, Spanish, French, German, Chinese, Japanese, Korean, and Turkish

HOW IT WORKS

1. Pick your favorite topics during onboarding
2. Get new facts delivered daily
3. Read, save, and share what interests you
4. Test yourself with trivia games
5. Watch your knowledge grow!

TRIVIA MODES

• Daily Trivia — Questions based on facts you've seen
• Mixed Trivia — Random challenge from all topics  
• Category Trivia — Focus on what you love

Perfect for curious minds, lifelong learners, and anyone who loves a good quiz. A few minutes a day makes you smarter — guaranteed.

Download now and start learning!
```

### What's New
```
Thanks for using Facts a Day! This update includes:
• Improved fact loading performance
• Bug fixes and stability improvements
Keep learning and stay curious! 🧠
```

---

## 🇩🇪 German (de)

### App Name (30 chars max)
```
Täglich Wissen - Quiz & Fakten
```

### Subtitle (30 chars max)
```
Lernen · Quiz · Schlauer werden
```

### Short Description (80 chars - Google Play)
```
Entdecke täglich faszinierende Fakten und teste dein Wissen mit Quiz-Spielen.
```

### Promotional Text (170 chars - iOS)
```
🧠 Jeden Tag neue Fakten! Erweitere dein Wissen, fordere dich mit Trivia heraus und werde schlauer. Wähle deine Lieblingsthemen und starte jetzt mit dem Lernen.
```

### Keywords (100 chars - iOS)
```
fakten,quiz,wissen,lernen,täglich,bildung,gehirn,spiel,interessant,wissenschaft,geschichte
```

### Description (4000 chars max)
```
Entdecke jeden Tag etwas Neues!

Täglich Wissen liefert dir faszinierende Fakten aus Wissenschaft, Geschichte, Natur und mehr — täglich mit wunderschönen Bildern. Teste dein Wissen mit unterhaltsamen Quiz-Spielen und verfolge deinen Fortschritt.

WARUM DU ES LIEBEN WIRST

• Täglicher Fakten-Feed — Frische, interessante Fakten jeden Tag
• Schöne Karten — Jeder Fakt kommt mit einem beeindruckenden Bild
• Smartes Quiz — 3 Spielmodi um dein Wissen zu testen
• Deine Themen — Wähle Kategorien, die dich interessieren
• Fortschritt verfolgen — Sieh deine Statistiken und Erfolgsserien
• Favoriten speichern — Baue deine persönliche Faktensammlung auf
• 8 Sprachen — Verfügbar in Deutsch, Englisch, Spanisch, Französisch, Chinesisch, Japanisch, Koreanisch und Türkisch

SO FUNKTIONIERT ES

1. Wähle deine Lieblingsthemen beim Onboarding
2. Erhalte täglich neue Fakten
3. Lese, speichere und teile, was dich interessiert
4. Teste dich selbst mit Quiz-Spielen
5. Sieh zu, wie dein Wissen wächst!

QUIZ-MODI

• Tägliches Quiz — Fragen basierend auf gesehenen Fakten
• Gemischtes Quiz — Zufällige Herausforderung aus allen Themen
• Kategorie-Quiz — Konzentriere dich auf das, was du liebst

Perfekt für neugierige Köpfe, lebenslange Lerner und alle, die ein gutes Quiz lieben. Ein paar Minuten am Tag machen dich schlauer — garantiert.

Jetzt herunterladen und loslegen!
```

### What's New
```
Danke, dass du Täglich Wissen nutzt! Dieses Update enthält:
• Verbesserte Ladegeschwindigkeit
• Fehlerbehebungen und Stabilitätsverbesserungen
Bleib neugierig! 🧠
```

---

## 🇪🇸 Spanish (es)

### App Name (30 chars max)
```
Conocimiento Diario - Trivia
```

### Subtitle (30 chars max)
```
Aprende · Juega · Sé más listo
```

### Short Description (80 chars - Google Play)
```
Descubre datos fascinantes a diario y pon a prueba tu conocimiento con trivia.
```

### Promotional Text (170 chars - iOS)
```
🧠 ¡Datos nuevos cada día! Amplía tu conocimiento, desafíate con trivia y conviértete en la persona más lista. Elige tus temas favoritos y empieza a aprender.
```

### Keywords (100 chars - iOS)
```
datos,trivia,quiz,diario,aprender,conocimiento,cerebro,juego,interesante,educativo,ciencia
```

### Description (4000 chars max)
```
¡Descubre algo nuevo cada día!

Conocimiento Diario te trae datos fascinantes de ciencia, historia, naturaleza y más — entregados diariamente con hermosas imágenes. Pon a prueba lo que has aprendido con divertidos juegos de trivia y sigue tu progreso.

POR QUÉ TE ENCANTARÁ

• Feed de Datos Diarios — Datos frescos e interesantes cada día
• Tarjetas Hermosas — Cada dato viene con una imagen impresionante
• Trivia Inteligente — 3 modos de juego para probar tu conocimiento
• Tus Temas — Elige las categorías que te interesan
• Sigue tu Progreso — Ve tus estadísticas, rachas y precisión
• Guarda Favoritos — Construye tu colección personal de datos
• 8 Idiomas — Disponible en español, inglés, francés, alemán, chino, japonés, coreano y turco

CÓMO FUNCIONA

1. Elige tus temas favoritos durante la configuración
2. Recibe nuevos datos diariamente
3. Lee, guarda y comparte lo que te interesa
4. Ponte a prueba con juegos de trivia
5. ¡Mira cómo crece tu conocimiento!

MODOS DE TRIVIA

• Trivia Diaria — Preguntas basadas en datos que has visto
• Trivia Mixta — Desafío aleatorio de todos los temas
• Trivia por Categoría — Enfócate en lo que te gusta

Perfecto para mentes curiosas, aprendices de por vida y cualquiera que ame un buen quiz. Unos minutos al día te hacen más inteligente — garantizado.

¡Descarga ahora y empieza a aprender!
```

### What's New
```
¡Gracias por usar Conocimiento Diario! Esta actualización incluye:
• Mejor rendimiento de carga
• Correcciones de errores y mejoras de estabilidad
¡Sigue aprendiendo! 🧠
```

---

## 🇫🇷 French (fr)

### App Name (30 chars max)
```
Savoir Quotidien - Quiz
```

### Subtitle (30 chars max)
```
Apprends · Joue · Progresse
```

### Short Description (80 chars - Google Play)
```
Découvrez des faits fascinants chaque jour et testez vos connaissances au quiz.
```

### Promotional Text (170 chars - iOS)
```
🧠 De nouveaux faits chaque jour ! Enrichissez vos connaissances, relevez des défis trivia et devenez plus cultivé. Choisissez vos sujets préférés et commencez.
```

### Keywords (100 chars - iOS)
```
faits,trivia,quiz,quotidien,apprendre,connaissance,cerveau,jeu,intéressant,éducatif,science
```

### Description (4000 chars max)
```
Découvrez quelque chose de nouveau chaque jour !

Savoir Quotidien vous apporte des faits fascinants sur la science, l'histoire, la nature et plus encore — livrés quotidiennement avec de belles images. Testez ce que vous avez appris avec des jeux de trivia amusants et suivez vos progrès.

POURQUOI VOUS ALLEZ L'ADORER

• Fil de Faits Quotidiens — Des faits frais et intéressants chaque jour
• Belles Cartes — Chaque fait est accompagné d'une image magnifique
• Trivia Intelligent — 3 modes de jeu pour tester vos connaissances
• Vos Sujets — Choisissez les catégories qui vous intéressent
• Suivez vos Progrès — Consultez vos statistiques et séries
• Sauvegardez vos Favoris — Créez votre collection personnelle
• 8 Langues — Disponible en français, anglais, espagnol, allemand, chinois, japonais, coréen et turc

COMMENT ÇA MARCHE

1. Choisissez vos sujets préférés lors de la configuration
2. Recevez de nouveaux faits quotidiennement
3. Lisez, sauvegardez et partagez ce qui vous intéresse
4. Testez-vous avec des jeux de trivia
5. Regardez vos connaissances grandir !

MODES DE TRIVIA

• Trivia Quotidien — Questions basées sur les faits que vous avez vus
• Trivia Mixte — Défi aléatoire de tous les sujets
• Trivia par Catégorie — Concentrez-vous sur ce que vous aimez

Parfait pour les esprits curieux, les apprenants à vie et tous ceux qui aiment un bon quiz. Quelques minutes par jour vous rendent plus intelligent — garanti.

Téléchargez maintenant et commencez à apprendre !
```

### What's New
```
Merci d'utiliser Savoir Quotidien ! Cette mise à jour inclut :
• Amélioration des performances de chargement
• Corrections de bugs et améliorations de stabilité
Restez curieux ! 🧠
```

---

## 🇯🇵 Japanese (ja)

### App Name (30 chars max)
```
毎日の知識 - トリビアクイズ
```

### Subtitle (30 chars max)
```
学ぶ · クイズ · 賢くなる
```

### Short Description (80 chars - Google Play)
```
毎日魅力的な事実を発見し、楽しいトリビアゲームで知識をテストしよう。
```

### Promotional Text (170 chars - iOS)
```
🧠 毎日新しい事実！知識を広げ、トリビアで自分に挑戦し、もっと賢くなろう。お気に入りのトピックを選んで、今すぐ学習を始めましょう。
```

### Keywords (100 chars - iOS)
```
事実,トリビア,クイズ,毎日,学ぶ,知識,脳,ゲーム,面白い,教育,科学,歴史
```

### Description (4000 chars max)
```
毎日何か新しいことを発見しよう！

毎日の知識は、科学、歴史、自然などから魅力的な事実を、美しいビジュアルと共に毎日お届けします。楽しいトリビアゲームで学んだことをテストし、進捗を追跡しましょう。

こんな方におすすめ

• 毎日の事実フィード — 毎日新鮮で興味深い事実
• 美しいカード — 各事実に素晴らしい画像付き
• スマートトリビア — 3つのゲームモードで知識をテスト
• あなたのトピック — 興味のあるカテゴリを選択
• 進捗を追跡 — 統計、連続記録、正確性を確認
• お気に入りを保存 — 個人的な事実コレクションを構築
• 8言語対応 — 日本語、英語、スペイン語、フランス語、ドイツ語、中国語、韓国語、トルコ語

使い方

1. オンボーディングでお気に入りのトピックを選択
2. 毎日新しい事実を受け取る
3. 興味のあるものを読んで、保存して、共有
4. トリビアゲームで自分をテスト
5. 知識の成長を見守ろう！

トリビアモード

• デイリートリビア — 見た事実に基づく質問
• ミックストリビア — すべてのトピックからランダムチャレンジ
• カテゴリトリビア — 好きなものに集中

好奇心旺盛な人、生涯学習者、クイズ好きな人に最適。1日数分で賢くなれます — 保証します。

今すぐダウンロードして学習を始めよう！
```

### What's New
```
毎日の知識をご利用いただきありがとうございます！このアップデートには以下が含まれます：
• 読み込みパフォーマンスの向上
• バグ修正と安定性の改善
好奇心を持ち続けよう！🧠
```

---

## 🇰🇷 Korean (ko)

### App Name (30 chars max)
```
매일 지식 - 퀴즈 트리비아
```

### Subtitle (30 chars max)
```
배우고 · 퀴즈하고 · 똑똑해지세요
```

### Short Description (80 chars - Google Play)
```
매일 흥미로운 사실을 발견하고 재미있는 트리비아 게임으로 지식을 테스트하세요.
```

### Promotional Text (170 chars - iOS)
```
🧠 매일 새로운 사실! 지식을 넓히고, 트리비아로 도전하고, 더 똑똑해지세요. 좋아하는 주제를 선택하고 지금 바로 학습을 시작하세요.
```

### Keywords (100 chars - iOS)
```
사실,트리비아,퀴즈,매일,배우기,지식,두뇌,게임,흥미로운,교육,과학,역사
```

### Description (4000 chars max)
```
매일 새로운 것을 발견하세요!

매일 지식은 과학, 역사, 자연 등에서 흥미로운 사실을 아름다운 비주얼과 함께 매일 제공합니다. 재미있는 트리비아 게임으로 배운 것을 테스트하고 진행 상황을 추적하세요.

이런 점이 좋아요

• 매일 사실 피드 — 매일 신선하고 흥미로운 사실
• 아름다운 카드 — 각 사실에 멋진 이미지 포함
• 스마트 트리비아 — 지식을 테스트하는 3가지 게임 모드
• 나만의 주제 — 관심 있는 카테고리 선택
• 진행 상황 추적 — 통계, 연속 기록, 정확도 확인
• 즐겨찾기 저장 — 개인 사실 컬렉션 구축
• 8개 언어 지원 — 한국어, 영어, 스페인어, 프랑스어, 독일어, 중국어, 일본어, 터키어

사용 방법

1. 온보딩에서 좋아하는 주제 선택
2. 매일 새로운 사실 받기
3. 관심 있는 것을 읽고, 저장하고, 공유
4. 트리비아 게임으로 자신을 테스트
5. 지식이 성장하는 것을 지켜보세요!

트리비아 모드

• 데일리 트리비아 — 본 사실을 기반으로 한 질문
• 믹스 트리비아 — 모든 주제에서 랜덤 챌린지
• 카테고리 트리비아 — 좋아하는 것에 집중

호기심 많은 사람, 평생 학습자, 퀴즈를 좋아하는 모든 분께 완벽합니다. 하루 몇 분으로 더 똑똑해지세요 — 보장합니다.

지금 다운로드하고 학습을 시작하세요!
```

### What's New
```
매일 지식을 이용해 주셔서 감사합니다! 이번 업데이트 내용:
• 로딩 성능 개선
• 버그 수정 및 안정성 향상
호기심을 유지하세요! 🧠
```

---

## 🇨🇳 Chinese Simplified (zh)

### App Name (30 chars max)
```
每日知识 - 趣味问答
```

### Subtitle (30 chars max)
```
学习 · 测验 · 变聪明
```

### Short Description (80 chars - Google Play)
```
每天发现有趣的知识，通过趣味问答游戏测试你的知识水平。
```

### Promotional Text (170 chars - iOS)
```
🧠 每天都有新知识！拓展你的知识面，通过问答挑战自己，变得更聪明。选择你感兴趣的主题，现在就开始学习吧。
```

### Keywords (100 chars - iOS)
```
知识,问答,测验,每日,学习,大脑,游戏,有趣,教育,科学,历史,事实
```

### Description (4000 chars max)
```
每天发现新知识！

每日知识为你带来科学、历史、自然等领域的精彩知识 — 每天配以精美图片呈现。通过有趣的问答游戏测试你学到的知识，并追踪你的进步。

为什么你会喜欢

• 每日知识推送 — 每天都有新鲜有趣的知识
• 精美卡片 — 每条知识都配有精美图片
• 智能问答 — 3种游戏模式测试你的知识
• 个性主题 — 选择你感兴趣的分类
• 追踪进度 — 查看你的统计数据、连胜记录和正确率
• 收藏夹 — 建立你的个人知识收藏
• 8种语言 — 支持中文、英语、西班牙语、法语、德语、日语、韩语和土耳其语

使用方法

1. 在设置时选择你喜欢的主题
2. 每天接收新知识
3. 阅读、保存和分享你感兴趣的内容
4. 通过问答游戏测试自己
5. 见证你的知识增长！

问答模式

• 每日问答 — 基于你看过的知识的问题
• 混合问答 — 所有主题的随机挑战
• 分类问答 — 专注于你喜欢的领域

适合好奇心强的人、终身学习者和所有喜欢问答的人。每天几分钟让你更聪明 — 保证有效。

立即下载，开始学习！
```

### What's New
```
感谢使用每日知识！本次更新包括：
• 加载性能优化
• 错误修复和稳定性改进
保持好奇心！🧠
```

---

## 🇹🇷 Turkish (tr)

### App Name (30 chars max)
```
Günlük Bilgi - Trivia Quiz
```

### Subtitle (30 chars max)
```
Öğren · Test Et · Zekileş
```

### Short Description (80 chars - Google Play)
```
Her gün ilginç bilgiler keşfet ve eğlenceli trivia oyunlarıyla kendini test et.
```

### Promotional Text (170 chars - iOS)
```
🧠 Her gün yeni bilgiler! Bilgini genişlet, trivia ile kendine meydan oku ve daha zeki ol. Favori konularını seç ve öğrenmeye başla.
```

### Keywords (100 chars - iOS)
```
bilgi,trivia,quiz,günlük,öğren,beyin,oyun,ilginç,eğitici,bilim,tarih,gerçekler
```

### Description (4000 chars max)
```
Her gün yeni bir şey keşfet!

Günlük Bilgi, bilim, tarih, doğa ve daha fazlasından büyüleyici bilgileri güzel görsellerle birlikte her gün sunar. Eğlenceli trivia oyunlarıyla öğrendiklerini test et ve ilerlemeni takip et.

NEDEN SEVECEKSİN

• Günlük Bilgi Akışı — Her gün taze ve ilginç bilgiler
• Güzel Kartlar — Her bilgi etkileyici bir görsel ile gelir
• Akıllı Trivia — Bilgini test etmek için 3 oyun modu
• Senin Konuların — İlgini çeken kategorileri seç
• İlerleme Takibi — İstatistiklerini, serilerini ve doğruluğunu gör
• Favorileri Kaydet — Kişisel bilgi koleksiyonunu oluştur
• 8 Dil Desteği — Türkçe, İngilizce, İspanyolca, Fransızca, Almanca, Çince, Japonca ve Korece

NASIL ÇALIŞIR

1. Başlangıçta favori konularını seç
2. Her gün yeni bilgiler al
3. İlgini çekenleri oku, kaydet ve paylaş
4. Trivia oyunlarıyla kendini test et
5. Bilginin büyümesini izle!

TRİVİA MODLARI

• Günlük Trivia — Gördüğün bilgilere dayalı sorular
• Karışık Trivia — Tüm konulardan rastgele meydan okuma
• Kategori Trivia — Sevdiğin konulara odaklan

Meraklı zihinler, ömür boyu öğrenenler ve quiz seven herkes için mükemmel. Günde birkaç dakika seni daha zeki yapar — garantili.

Şimdi indir ve öğrenmeye başla!
```

### What's New
```
Günlük Bilgi'yi kullandığın için teşekkürler! Bu güncelleme şunları içerir:
• İyileştirilmiş yükleme performansı
• Hata düzeltmeleri ve kararlılık iyileştirmeleri
Merakını koru! 🧠
```

---

## Quick Reference: Localized Taglines

| Language | App Name | Subtitle |
|----------|----------|----------|
| 🇺🇸 English | Facts a Day | Learn · Quiz · Get Smarter |
| 🇩🇪 German | Täglich Wissen | Lernen · Quiz · Schlauer werden |
| 🇪🇸 Spanish | Conocimiento Diario | Aprende · Juega · Sé más listo |
| 🇫🇷 French | Savoir Quotidien | Apprends · Joue · Progresse |
| 🇯🇵 Japanese | 毎日の知識 | 学ぶ · クイズ · 賢くなる |
| 🇰🇷 Korean | 매일 지식 | 배우고 · 퀴즈하고 · 똑똑해지세요 |
| 🇨🇳 Chinese | 每日知识 | 学习 · 测验 · 变聪明 |
| 🇹🇷 Turkish | Günlük Bilgi | Öğren · Test Et · Zekileş |
