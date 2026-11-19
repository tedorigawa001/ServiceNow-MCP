# AP05：PK02／FX03・04の旧compiled保証とfriend不在・開発補完

Version: release-ap05-pk02-fx03-fx04-verification-split-draft-0.3 / Date: 2026-11-19。
Status: **試験分離の設計案。旧試験の変更・撤去・移行は未承認。** 静的基準HEADは`06e8d34`。[PK02の保証レビュー](BEST_PRACTICE_RELEASE_FRIEND_TEST_GUARANTEE_REVIEW.md)、[B-03のFX03／04](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)、[AP02の範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)のS01／02／06／07、K01〜04を接続する。[PK01／FX05](BEST_PRACTICE_RELEASE_AP05_PK01_FX05_VERIFICATION_SPLIT_DESIGN.md)は参照のみ。PK02 scriptに共存するPK03／FX06、旧ND単体UN62・LM03、既存値kernelの梱包／移行判定は対象外。

draft-0.3のレビュー修正：レビュー修正の基準HEADは`ea16456`（修正時のHEADは`ea16456`）。§5の照合範囲「EF3-N01〜07」は、本文が参照しない・照合していないEF3-N05を含む表記だったため、実際の参照どおり「EF3-N01〜04・06・07」に訂正した。件数・各行・承認状態は変更しない。

draft-0.2のレビュー修正：レビュー修正の基準HEADは`8b6e464`（修正時のHEADは`8b6e464`）。他の設計文書と同じく、末尾に静的確認の記録（§5）を追加した。H／P／N／Dの各行、旧assertion、未代替範囲、承認状態は変更しない。B-03とfriend試験レビューにある本書への参照（draft-0.1）は作業中の変更と重なるため、今回は更新していない。

先行AP03差分、正式発行口・C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、Unknown・調査保留、元期限と既定並列度を維持する。今回はMDのみ。旧試験変更／skip・実装・撤去・試験再実行・build／梱包・混入操作・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 H：現行PK02と旧compiled試験の直接保証

[現行PK02](../tests/review/package-http-classification.mjs)はpack dry-runの一覧でtests、指定のSA／ND wrapper等のJS・宣言・両mapの除外を検査し、同梱JSから指定module名への参照や、JS／宣言／mapへの開発root等の混入も検査する。一方、FX03・04は別childで**リポジトリのdist**を読み、wrapperをimportするとmodule評価時に対応するfriendを各1回取得する。配布物にwrapperがないことは、同梱class moduleにあるfriendのexport・登録・runnerが消えた証拠ではない。2本のchild起動箇所に明示timeoutはなく、既存の別系統60秒・製品期限をこの終了確認へ読み替えない。

| ID／旧fixture | 固定する入力と直接assertion | 旧試験として保持する境界・対象外 |
|---|---|---|
| PKF2-H01／FX04 [SA正常](../tests/review/fixtures/compiled-source-status-binding.mjs) | 合成per-user、正常親bytes、403／宣言`cancelled`。closed-gateのstate、消費1・accepted_before_close=true、fake_io、cleanup=closed、reserved=0、fallback／正式発行disabled・Permit unavailable、permissions全false、C=2／G=親bytes長／P=0、PRIVATE非出力、global fetch呼出し0 | 元profileと旧実session／sourceで維持。cancelledはprofileの申告値で、実readerのcancel／unlock試験ではない。返値のready世代、全private参照、全post-guardはこのcompiled正常caseの直接assertionにない |
| PKF2-H02／FX04 SA拒否・取得口 | 404／宣言`unconfirmed`はcode=internal_review_errorのPromise拒否。classの`probeNewStatusAcceptance` own property不在、先行import後の`takeStatusAcceptanceProbe()`再取得はcode=internal_review_error | unconfirmed時のcleanup操作数・上位診断保持を直接比較しない。classのown名不在と、取得exportが存在したうえでの二度目拒否を保持し、配布物のexport不在へ換算しない（SA-26） |
| PKF2-H03／FX03 [ND正常](../tests/review/fixtures/compiled-native-session-composition.mjs) | 合成per-user、正常親bytes、403／404×bodyなし／空Streamありの4variant。ok、Permit unavailable、C=2／G=親bytes長／P=0、same_core／same_source=true、session consumptions=1・native consumed=1、native upper sealed、permissions全false・PRIVATE非出力、bodyあり時unlock | 4variantの全てを保持。same_core／same_sourceは返値の観測で私有参照の直接比較ではない。各reader操作数・issued成功数・全資源解放・accepted_before_close値の直接assertionを補完しない |
| PKF2-H04／FX03 ND故障・取得口 | 401＋cancel内の同期throwで、authentication_failedとrelease cleanup.phase=unconfirmedを別々に保持、issued=0／draft=null、PRIVATE非出力。classの`probeNativeStatusComposition` own property不在、先行import後の`takeNativeStatusCompositionProbe()`再取得はinternal_review_errorを含むthrow | hard HTTPとcleanup未確認を別軸のまま維持。故障caseのunlock、例外メッセージ全体、全slot・上位sealは直接assertしない。再取得の正規表現とSAのcode検査も同じassertに書き換えない（ND-30） |

Hは同revisionの旧build・旧wrapper・旧fixtureの組で保持し、候補Pの展開物から起動しない。[NS01](BEST_PRACTICE_RELEASE_AP01_NS01_BINDING_GUARANTEE_REVIEW.md)／[NS03](BEST_PRACTICE_RELEASE_AP01_NS03_CONSUMPTION_REVOCATION_GUARANTEE_REVIEW.md)の元source試験（同登録ready世代、copy／foreign、取消・期限、復帰からcloseまでの失効、診断保持）を別に残す。FX03・04だけでそれらをcompiled網羅済みにしない。

## 2 P：候補配布物の通常経路を正対照にする

候補は同revisionの空buildから生成し、**隔離した配布物の展開root**を対象にする。リポジトリdist・tsx・隣の成果物・開発loaderへのfallbackは禁止。検査は合成入力限定で、実接続・受付の開放ではない。

| ID | 維持する正対照（未実施） | 旧閉鎖試験と混同しないもの |
|---|---|---|
| PKF2-P01 | 展開root内の通常importが成功し、construction／source値kernelと既存の必要依存が解決する。通常sessionを生成し、sourceを2引数で結ぶ。既存fetch・signal・limits、親→release判断→同sourceのPermit／port、失効・固定closeを保持 | 旧status-only経路を通す必要はない。通常matchedのPermitと、旧status draftの`release_permit=unavailable`は別契約 |
| PKF2-P02 | `synthetic_io` 省略時の同期summary、初期source／transport claim、`claimStatusBinding`から同core会計への接続、auth=false／ready=0、C/G/P=0、予約返却・fixed close、dispatch／発行の閉鎖 | 正常省略時にも実session／ownerは構築する。旧probeのready世代1や見かけのsummary一致はこの保証ではない。既存の通常停止／worker／出力をDの結果に置換しない |
| PKF2-P03 | AP03の確定revisionを前提に、通常import成功と、別入力の禁止own synthetic_ioの同期invalid_input／fake未到達を独立に観測。C07-Bの通常2引数の受入も確認 | 入力拒否が成立してもfriendのexport／本体不在は未証明。型エラーや依存欠落だけで実行面の合格にしない |

## 3 P：friend不在と、混入を検出できることを分ける

正常候補でPの正対照と不在の両方が成功した上で、混入対照は隔離した別コピーごとに1種類ずつ判定する。これは将来の設計条件で、今回の混入・実行を許可しない。

| ID／対応 | 正常候補の不在・閉鎖条件 | 混入／欠落の判別条件 |
|---|---|---|
| PKF2-N01／NC04・EF3-N04／06 | 残るbounded-readを正常ロードできることを前提に、SA／ND両方の旧named export不在、namespace own key不在、class static／prototypeの禁止口不在を独立確認。C06どおり旧named importのlink時失敗と、廃止wrapperへのdeep importの解決失敗を区別 | 片側だけ復活した場合も個別に検出。単なるmoduleの起動不能、旧take二度目の同期throw、wrapperのファイル不在だけでは合格にしない |
| PKF2-N02／NC03・04／EF3-N01・02・04 | 定義・登録slot・static代入・private runner／native driver、wrapperのmodule評価時取得への到達辺、別名・再export・dynamic／型・mapの辺が本番に残らない。未解決動的辺はUnknown | 名前を変えた入口、未exportでも残る登録本体、再export・動的参照を構文／解決した依存閉包で検出。denylistの文字列検査だけで代替しない。共有のstatus binding／会計を誤って削除しない |
| PKF2-N03／NC04・EF3-N03 | SA／ND wrapper、旧専用宣言、開発root等が同梱物のJS／宣言／両mapや埋込みsourceに残らない | stale JS・宣言・各mapの残留を各別コピーの該当理由で検出。現行PK02の他の同梱正対照・負対照は変更しない |
| PKF2-N04／NC05・EF3-N07 | 必要な通常kernelは存在し、P正対照を同じ展開rootで実行できる | 必要module欠落は正対照失敗として検出。不在検査に入れない・理由不明・代替loaderで成功は不可。未確認を合格扱いにしない |

## 4 D：補完できる保証と残差

| ID／元境界 | 既存開発側の対照と将来のcompiled候補 | 残す未代替保証 |
|---|---|---|
| PKF2-D01／FX04 | [development source](../tests/review/development-source.test.ts)の別realmで一度ready・一度消費／失効、[development native](../tests/review/development-native.test.ts)のprivate cleanup proofからのstatus消費、二重消費・close後proof拒否を候補にする。Dでは親JSON ackとstatus-only消費を別計数 | Dのready数値、cleanup proof、closed summaryは、旧SAの同constructor／登録lease／登録ready・close前private returnの同位置を回復しない。旧404／unconfirmedの申告profileをDの実cleanup拒否と同等にしない |
| PKF2-D02／FX03 | 既存Dには403／bodyありの同reader（read=0、cancel／closed／release_lock各1）、403／404 no_body時の操作0、401＋cancel失敗時のHTTP理由・cleanup未確認の分離がある。正常404／bodyありは、既存の404取消対照を正常成功と数えず別compiled受入行にする | Dの401故障はcancelのPromise拒否で、旧401＋同期throwと注入位置を分ける。Dのsource／core・上位診断は旧実sessionの私有実体、外側close／診断保持、旧NDの台帳と非同等。UN62／LM03を回復済みにしない |

Dは本番と別brand／別台帳・別buildとし、旧friendを取得したりPのsession／Permit／証拠を採用したりしない。同一processの非干渉はB-03のI対照、子processの終了・stdio／cleanup・外側時間枠は別承認。H／P／Dの結果・元assertion・未代替範囲・候補manifest・失敗理由を個別記録する。AP01／04の保証差とAP05の切替／旧試験処遇が未承認の間は、旧期待値・試験・梱包設定を維持する。

## 5 静的確認

基準`8b6e464`で、[SA compiled](../tests/review/fixtures/compiled-source-status-binding.mjs)・[ND compiled](../tests/review/fixtures/compiled-native-session-composition.mjs)の各assertion（H01〜04）、現行PK02のpack dry-runによるtests／wrapper除外と明示timeoutのないchild起動、Dの403／404 no_body・bodyあり・401＋cancel拒否の対照（D02）と、D01の候補試験の存在、NC03〜05・EF3-N01〜04・06・07の参照先を静的に照合した。本書のID13行（H4／P3／N4／D2）、表4・ローカル参照13・明示anchor0、参照先・表列数・末尾改行・差分空白を確認し、変更は本書1件のみ、stage0、製品・試験・設定の差分はない。製品module import・試験再実行・build／pack・実展開は行っていない。
