# CM-04-02 新規run pre-I/O composition 検証

Date: 2026-10-30。合成依存のみ。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 実装範囲

固定classの新規session→同認証snapshot／owner登録済みlease→一度限りtransport claim→固定sourceの初期identity binding→同core accounting予約→固定解放を接続した。既存sessionの切替、外部work／source factory／dispatcher／release値の受入れ、更新port取得口は追加しない。frozen限定summaryだけを返し、成功も`constructor_bound`である。

認証／GET／native取得は開始しない。初期source identityはReleasePermitではなく、ready世代0・C/G/P=0・正式発行disabledのまま閉じる。CM-04-03のack受理やprepared成功まで実装したとは主張しない。

## 開発中のRED／GREENと切分け

- 初回tracerは入口未実装で失敗し、接続後に成功した。
- private fieldを`typeof this.#budget...`で型参照したためTS1003／transform parse errorが出た。生成関数の戻り型からの参照へ限定修正し、buildと関連60件を再確認した。その後の型検査ではdescriptorのundefined型（TS2345）、private identifierのoptional chain（TS18030）も検出し、own-keyのdescriptor存在指定と明示的なifへ修正した。最終buildで再確認済み。
- 公開stats／remainingMs差替えの試験はphase_deadline_exceededで失敗した。既存legacy checkを新規接続の権限として使わず、private登録leaseと同coreのfirst primaryによる検査へ変更した。
- 不正signalの試験は当初internal_review_errorとなり、通常constructorのadmission確保後にlistener操作が失敗し得た。新規入口でsignalのnative brand・prototype・操作差替えを生成前に拒否し、固定invalid_input・後続new run成功を確認する。既存legacy constructorの信号APIは今回変更しない。
- 公開close差替えの試験は、差替え先が2回呼ばれて失敗した。新規入口からは固定private解放本体を呼び、公開closeは同本体へ委譲する形にした。公開観測／解放の差替えを新規入口の権限・解放証拠にしない。

## 検証対象

同leaseの認証前binding、外来snapshot／lease／handle、二重消費、callback再入、ready／close後拒否、別sourceの後段混入拒否、公開観測差替え、不正input／mode／signal、取消・期限・低減cap、timer／admission解放、秘密・権限非出力、既存session非採用。compiled smokeはfetch／Response／Streamsを拒否して新規接続を確認する。

## 最終結果

Git indexの11ファイル＋HEADだけから一時copyを作り、既存node_modulesのみを参照して確認した。無関係な`.vscode/`・`CLAUDE.md`は含めない。以下の確認後の追記は検証記録のみであり、コードは変更していない。

| 確認 | 結果 |
|---|---|
| コミット対象だけのbuild | `npm run build`成功 |
| コミット対象だけの全体合成 | `vitest run --maxWorkers=3`：193ファイル・5,830件成功、108.10秒。期限は変更していない |
| 今回のTS4ファイルのlint | エラー・警告0 |
| CM-04-02専用試験 | 新規26件。初回REDと境界追加後のGREENを確認 |
| canonical／legacy／typed dispatch compiled smoke | 成功。新規pre-I/O接続ではfetch／Response／Streamsを禁止して確認 |
| native adapter compiled smoke | 既存NA-02／03成功（注入Response／Streamsのみ） |
| offline pack | 405ファイル、fixture非同梱、pure coreのruntime importなし |
| 文書内ローカルfile参照 | 更新4文書の56参照、欠落なし |
| staged diff whitespace | 問題なし |

全体試験の製品期限・試験期限は緩めていない。今回の最終全体実行に失敗・skipはない。開発中のRED／構文・型検査失敗は上記のとおり保持する。

## レビュー修正（2026-10-30）

- 指摘：固定入口は呼出し元snapshotをそのままconstructorへ渡し、constructorはcopyを保存した後に元objectを再読してURL・authMode・token有無・principal keyを検証していた。tokenのgetterが読取ごとに別値を返すと、保存token（要求に使用）と検査・principal keyの値が分かれたまま`constructor_bound`になった。現段階はI/Oなしで即closeするため実害はないが、CM-04-03で同入口に認証／I/Oを加えると同principal admissionの迂回や検査値と使用値の不一致につながる。
- 修正：入口でsnapshotとoauthを既知keyのdata propertyだけから一度copyしてfreezeし、getter・proxy・独自prototype・未知keyは読まずに`invalid_input`で拒否する。constructorの検証・principal keyは保存copyだけを読むようにし、legacy経路でも元objectを再読しない（plain objectでは値・挙動は不変）。
- 回帰試験：accessor snapshot（token／instanceUrl／authMode／oauth）4件と、proxy・class prototype・未知key・oauth accessor・oauth未知key 5件を追加（getter読取0・timer 0）。修正前実装へ戻すとこの9件だけが失敗する。
- 再検証：tsc・変更対象ESLint・build・全体193 files／5,839 tests PASS、CM-01〜CM-04-02 offline梱包・compiled smoke PASS（405 files）、`git diff --check` PASS。上記の最終結果は修正前の記録として残す。

## 未接続／未実施

CM-04-03のprivate ack／親／release判定、native/typed実session I/O、正式body receipt／選択payload／worker job、final予約移譲・P更新portは後続。実通信・実機操作・設定変更・permit発行・Pushは行わない。
