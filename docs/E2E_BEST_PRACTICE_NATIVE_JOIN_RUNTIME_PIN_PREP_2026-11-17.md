# JR-B先行shell・固定slot・非実行Promise pinの検証記録

Date: 2026-11-17。基準HEAD: `a3bb804`。設計：[先行runtime・pin差分 draft-0.3](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_RUNTIME_PIN_DELTA_DESIGN.md#12-先行shell非実行pinの限定実装)。

## 限定実装

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)の閉鎖区間で、同role pendingへ先行shellを保持し、cleanup context→identity→owner pinを一度だけ準備する。runはcontextなし。保持後・freeze後の停止／同一性postと、module基準の非実行descriptor検査を行う。準備の成功値はbooleanだけで、実行・発行の資格ではない。旧execute／cleanから新準備関数を呼ばず、source・fixtureをpackage外に保つ。

CP00のrole slotにfaultAtを先行配置した。最後の保持位置と最初の失敗位置・root primaryは別で、失敗後もclaim・partial参照・同期revokedを維持する。pendingを空へ戻さず、再要求でも同shell／identity／pinを再生成しない。canonical照合用closure参照は同割当て由来のaliasで、独立writerを持つ第二cacheではない。旧anchor直下のrunPending／cleanupPendingはnullのままである。

module初期化で既存P／then、prototype／descriptor 6個と反射操作を固定捕捉する。ownerごとに現在値を再pinしない。live検査はgetterを実行せず、Objectのglobal binding自体とisFrozenのdata条件も確認する。新readonly topology checkerは捕捉済み操作を使い、旧JR-A beginの直前にも旧checkerへの安全な到達条件を確認する。module捕捉前の改変・bootstrap未成立まで真正性や診断取得を保証したとはせず、Unknownのままである。

shellの23実行／観測fieldはnull・false・未開始のliteralで固定した。executor／observer closure・引数tuple、Promise、candidate／work、settler、ackを生成しない。upperへの通知・copy・失敗終端も未接続で、失敗を架空のHTTP／native cleanup factsへ変換しない。

## 合成対照と保証の区別

[新source試験](../tests/review/native-join-runtime-pin.test.ts)は26件。[独立oracle／scratch導出](../tests/review/fixtures/native-join-runtime-pin-model.mjs)は出力JSの固定区間を管理された新しい合成JS realmへ導出する。descriptor故障はそのrealmだけを変更し、runnerのglobal・設定や後続caseへ持ち越さない。これは実機VM調査ではない。製品側に新friend・constructor／descriptor注入口・登録口を作っていない。

| 対照 | 確認した内容 |
|---|---|
| role別正対照・閉鎖field 23 | run／cleanupで同shell・同identity・同pin。停止下の同record cleanupは許可、重複は同shellを失敗保持。23fieldの欠落／変更をpostで拒否、constructor／observer／dispatch 0 |
| 入口同一性拒否32 | slot／root／seedとcleanupのrecord／anchorにforeign・copy・hook付きProxy・revoked Proxy。hook 0、foreign slot不変、自ownerの同期失効 |
| post同一性拒否30 | shell／identity／pinのforeign・copy・Proxyと、主holder／identity／pinの同値copy差替えを拒否。mutable holderの一致だけでcanonicalへ昇格しない |
| partial生成14・停止2 | shell割当て前後、context／identity／pinの保持前後でfaultAt・最後の位置・取得済み参照を保持。identity後停止ではrunはpinを作らず、cleanupは元のread-only条件を維持 |
| pin変更16 | speciesのget／set・data化・削除・flags、constructor／thenの参照・accessor・flags、P／prototypeの親、isFrozenとglobal Objectを検査。getter hook 0、再pin／生成0 |
| 構文正常な変異17 | descriptor・親prototype・flags、先行fault位置、主pending保持、失敗readiness、各canonical引数、閉鎖field、途中停止postの省略を独立oracleが拒否 |
| semantic正負対照 | role・nullable work／handler・観測claim／dispatchのliteral、readonly pin、run identityのnull context、null publishedを確認。正対照と8不正を1 Programで照合し、診断を各不正行へ限定 |

対照数をsourceの26件へ足し合わせない。型・phase値はauthorityでなく、native Promise／resourceの実体保証ではない。新compiledは[固定dist検査](../tests/review/fixtures/compiled-native-join-runtime-pin.mjs)だけを入力にし、source／TypeScriptへfallbackしない。新準備と旧実class／fake I/O連続試験も別保証である。

## 初回失敗・REDと修正

| 段階 | 原因・対応 |
|---|---|
| 先行RED | 最初の1件は新しい準備境界がないため失敗。先行shell／identity／pinを実装後に成功 |
| identity後の停止 | 追加対照が1件失敗。停止を最終postだけで見ていたためpinまで生成していた。各保持／freeze後に同owner・停止postを追加し、元identity位置とnull pinを保持して拒否するよう修正 |
| 重複要求 | 追加対照が1件失敗。JR-A拒否はslotを失効したがshellのreadinessがpin_readyのままだった。新準備の拒否を固定失敗保持へ合流させ、同shellをfailed_retainedにした |
| 旧JR-A回帰の初回 | 3file・33件中30成功／3失敗。追加faultAtが旧empty期待値にない点と、閉鎖した準備関数からのbegin呼出しを旧call 0検査が拒否した点。新初期fieldと唯一の内部caller 2本を明示し、元の拒否／失効oracleは維持した |
| pin故障の初回 | 新7件中6成功／1失敗。isFrozen getter故障を旧owner構築前に入れ、旧sameControlOwnerでthrowして新pin検査へ届かなかった。故障位置を旧構築後・新準備前へ直し、旧製品codeは変えなかった |
| global Object getter | 追加対照が1件失敗。新準備がglobal Objectを直接読むためgetterが実行された。捕捉済みglobal objectへのown descriptor確認へ変更し、getterを実行せず固定拒否するよう修正 |

後ろ2つを混同しない。前者は試験の故障注入位置の問題、後者は新規実装の検査不足だった。期限・既定並列度や旧期待値を緩めて成功へ変えていない。

## 最終検証

すべて`bdo`経由、worktreeで実施。indexのみの別展開ではない。旧試験を残し、新準備の導出と正常legacy入口の回帰を分けた。

| 検査 | 結果 |
|---|---|
| build／型検査 | exit 0、既存tsconfigを使用 |
| 変更TS 3本・MJS 3本のESLint | exit 0。全repository lintではない |
| 関連source 10file | 270件成功、失敗0、群全体2.82秒。旧244件＋新26件。個別5秒・既定並列度は維持 |
| 新旧compiled 9本 | 新準備、JR-A、CP00〜05、空準備、VK01／02、BG01、旧ND-01／02／03がexit 0・signalなし。各直接実行は外側60秒内 |
| 新MJS 2本の構文 | exit 0 |
| baselineとの本文／公開面比較 | 旧sameControlOwner／stop／fail／sample／observe／wait／clean／eligible／guard／consume／issue／snapshot／execute／closeの14本文と4exportが一致 |
| offline梱包dry-run | ignore-scripts／offline、441file・436 runtime artifact。旧root群・試験非同梱、新準備2関数／basis／modelのruntime参照0。実tarball生成・展開は未実施 |
| 文書・差分静的確認 | 設計3文書と本記録のlocal link 34件・表23個に欠落／列ずれ0。末尾改行・差分空白を確認。既存CP補強試験の内容hashはHEADと同一で、対象11file以外の変更・stageなし |

旧JR-Aの27資格拒否・32同一性拒否・121 phase値・12変異、CP回収／旧nativeの期待値は維持した。初期shapeのfaultAt追加と閉鎖caller許可を除き、旧oracleを新準備に合わせて弱めていない。compiledで私有型／pin／関数の宣言漏出も拒否した。17変異の成功は有限対照であり、任意の不正実装を検出する証明ではない。

## 未実施・残課題

RS05の固定executor／観測closure・tuple生成、同P／settler生成、candidate／workのbrand検査・拒否観測、失敗通知・role別終端、JR-Cのprivate公開／最終post、旧work採用・dispatch／entryは未接続。準備済みpinを渡す公開／採用口もない。

module捕捉前の改変、Promise／nativeの実backing容量、OOM／process障害時の完全回収、外側custody／最終discardはUnknown。新claimの完全な実resource所有保証や新LM03・friend撤去・AP承認・全体回帰は未検証である。

正式発行口／C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、LOAD6／LOAD7選択・AP01〜06未承認、VM／監視／telemetry調査保留を維持する。実接続・実通信・実機操作・設定変更・コミット・Pushは行っていない。

## コミット前の対象限定再検証 2026年11月17日

今回の11fileだけをstageし、index全体を別の空directoryへ展開した。既存dist・`.git`・未登録の作業fileは持ち込まず、導入済み依存だけを参照した。展開先でbuild・型検査・変更TS／MJS計6fileのlintがexit 0、関連10file・270件が成功（群全体2.91秒）。個別5秒・既定並列度は維持した。

展開先で生成した固定distによる新旧compiled 9本がすべてexit 0・signalなしで終了した。外側60秒を延長せず、新MJS 2本の構文もexit 0。offline・ignore-scriptsの梱包dry-runは441file・436 runtime artifactで、旧root群・試験非同梱と新private継続／basis／modelのruntime参照0を確認した。旧14関数本文・4exportも基準HEADと一致した。

再検証後の追加は本節だけで、ソース・試験入力・設定は変更しない。最終indexと展開先の一致・対象11file・文書link／表・差分空白を再確認する。全体回帰・実tarball展開は未実施のままであり、Promise生成・観測・private公開・dispatch未接続、各閉鎖条件・Unknown・調査保留を維持する。Pushは行わない。
