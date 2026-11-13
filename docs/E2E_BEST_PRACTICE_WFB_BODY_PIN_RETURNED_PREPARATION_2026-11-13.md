# WF-B：R-a returned値契約・先行scalar・固定診断の合成検証

Date: 2026-11-13 / 基準HEAD: `d9002e02026451f55b1e1767701dbc02b2c1507d` / 合成依存限定。実装時点は未コミット、コミット準備の隔離再検証は末尾へ分離する。

## 実装範囲と閉鎖境界

[returned差分設計draft-0.3 §15](BEST_PRACTICE_WFB_BODY_PIN_RETURNED_ACCEPT_SEAL_DESIGN.md)のR-aだけを実装した。狭い状態型、strict pre／post値検査、同CanonicalGateDraftRootの先行4scalar、初期ownerだけを確認する新合成factoryと固定診断である。private実R/S/T供給や実returned preの呼出しはR-bへ残し、値正例を実ownerの正例に使わない。

新入口createProbeBodyPinReturnedPreparationFakeはconstructor固定の準備flagだけtrue、既存source／frame／C-c等22flagは全false。prepare／check／close／inspect以外の公開methodや任意入力の登録口はない。source発行・call・returned開始claimは行わず、元の#fixed・seal・返答生成attemptも使わない。既存C-cの最終観測中input_rejected写像修正と旧factoryの保証を保持する。

正式発行口・既存C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実受理・G_R／G_A・C-03・source利用claim消費・payload借用／bind・BC00・構築ready・Journal供給・field clear／root終端は未接続。実接続・実通信・実機操作・設定変更・Pushは行わない。依存導入・manifest／lockfileの変更もない。

## 値契約とowner初期確認の区別

| 境界 | 今回の保証と限界 |
|---|---|
| 有限state | not_started／checking／accepted／blocked／failedの狭い組。strict4key・postのstrict boolean、失敗前の現在点／初回点の一致。後段正例は純粋な値だけ |
| returned専用値検査 | source13／receiver14／root31／callee6／state4項目。preはsource call・root call after、postはsource after・root returned before。他方の位置や不正flagをORで許容しない |
| 来歴／実保持 | issuedSame等の値は実同一性の証拠ではない。root来歴・metadata／実I/C/J・live ownerへのprivate供給と全照合は未接続。pure関数はexportしない |
| 先行4scalar | constructor tokenより前にliteral not_started／false／none／none。全classのoperational writer 0。checking消費・post true・受理成功・G_R／G_Aを作らない |
| 実ownerの到達 | 未開始frame／非ready、seed／cells／binding／run／source不在、未call、未seal／空cache等の初期状態だけを直接検査。正常準備でもconstruction_unconfirmed／returned_not_connectedへ固定拒否 |
| 固定診断 | 診断更新前に位置object／返答を生成せず、root firstを初回だけ記録。原始codeは直接分岐で返す。開始前closeはfirst none、先行input_rejected等を後発closeで置換しない |
| 公開値 | 凍結plainな有限projectionだけ。allowlist・strict boolean・実参照保持有無／call数／body状態を投影。source／owner／cache／実行tokenを返さない |

準備shellの反復操作は同じ固定診断を読むだけで、受理claimを払い戻す方式ではない。claimそのものが未接続であり、実ownerのphaseはnot_startedのまま。初期条件が不正ならstate_invalidを保持し、型に合う状態へ修復しない。cacheを持たない今回の原始拒否を「正常な単一cache公開」やcleanup証拠へ読み替えない。

## 新規合成・compiled対照

| 対照 | 件数・内容 |
|---|---|
| 公開入口の合成 | 68件。初期固定拒否・開始前close・入力hook非実行／初回理由保持・有限凍結診断の4件と、prepare／check／close／invalidの独立prefix oracle64件 |
| 状態oracle | 450組。6phase候補×3post候補×5現在点×5初回点。期待値は試験側の独立条件式で計算 |
| pre／post位置oracle | 81組、各組で両関数を比較。source boundary・root step／boundary・現在点を独立に変える。実G_R／G_Aは使わない |
| 単項破損 | 136件。pre／post各68leafを反転／未知文字列化し、すべて拒否 |
| strict shape | 60件。外側＋5区分で余分key／欠落／symbol／prototype／accessorを拒否、accessor getterのhook 0 |
| 実初期owner | 15件。残存cell、4scalar、活動／ready、call履歴、seal／attempt／cache等を局所破損し固定state_invalidを確認 |
| 未信頼参照 | source保持slotへProxyを局所注入。初期検査・公開診断までget／ownKeys／getPrototypeOf 0、field読取り・採用なし |
| 投影 | 4件。phase／現在点／初回点の秘密値はunconfirmed、非boolean postはfalse。秘密非echo |
| AST | 4fieldの先行literal、operational writer 0、新factoryの既存22flag false・準備flag true、固定診断と初期確認の非割当て構造を確認 |
| semantic compile-fail | 9行。private初期matcher／post field、不正state・異なる失敗点、pre sourceのafter、活動call、callee marker false、公開値からsource復元、不正pointを拒否 |

公開objectから値checkerを呼ぶ口や「正例を登録する」fixture APIは作らない。compiledはscratch内だけでsubjectの関数を参照し、独立literalと条件式から期待値を作る。shape／field対照は値契約の保証、private-slot局所故障はguard感度の保証であり、外部からの実発行来歴の証明ではない。型エラーはsemantic拒否の項目だけへ算入する。

## RED・初回失敗と修正

| 観測 | 原因・対応 |
|---|---|
| 最初の公開入口1件RED | factory未追加。初期状態のみの別constructor modeと固定拒否を追加してGREEN |
| checking／preの状態正例RED | 初回state checkerは初期状態だけだった。値専用の狭いunion全枝へ拡張し、450組を確認。実writerは追加しない |
| 専用pre／post関数未定義RED | 個別checkerを追加。source call／afterを別関数で検査し、旧calling coreは変更しない |
| compiledの非割当て診断監査がrunFirstを拒否 | runFirstは内部で配列を作るため、新固定診断の原始code返却を直接分岐に分離。公開projectionでの既存allowlist利用は維持 |
| 残存cell対照がstate_invalidではなく通常拒否になった | 初期確認に元seed／cells／binding／run等の不在条件が不足。直接参照比較を追加し、初期15対照で拒否を確認 |
| 小回帰287件中export一覧1件失敗 | 新合成factoryを明示export一覧2箇所へ追加。旧exportの削除／改名はない。再実行287件成功 |
| AST先行field監査の初回失敗 | 最後のfieldのendとconstructor.posが等しかった。posは先行空白を含むため、constructorの実token開始getStartで比較。配置を変える製品修正は不要 |
| lint初回2件失敗 | 実ownerへ未接続のpre／post純粋関数が未使用判定。compiledだけが使う理由を添えて当該2宣言だけに局所例外を指定。呼出し口の追加やlint構成ファイル変更はしない |

これらは同じ不明原因へ修正を重ねたものではなく、各対照・境界を追加して個別に原因確認／再検証した履歴である。既存C-cの31等価節や旧試験の成功を、新returned実接続の保証へ転用しない。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新Vitest | 68件成功、失敗0 |
| 関連合成 | 44ファイル3,307件成功、失敗0（前段3,239件＋新68件） |
| 新compiled | exit 0。上記450状態／136leaf／60shape／81位置組／初期15／投影4／型拒否9行、hook 0・operational writer 0 |
| 新旧compiled34本 | 初回33本成功・新監査AST位置比較1本失敗、timeout 0。修正後の一括再実行は34本すべてexit 0、失敗／timeout 0。各processの外側60,000ms上限を維持 |
| strict TypeScript | composition fixture・probe-body全試験・composition試験でexit 0 |
| build | exit 0 |
| lint | 変更5ファイルでexit 0、上記初回2件から再確認 |
| 梱包dry-run | 441files、workerあり、src／tests／fixture混入0。ignore-scripts／offline・一時cache、実archive生成／導入なし。実package-workerは未実行 |
| 文書・差分 | 最終追記後の文書5件のローカル参照45件に欠落0、34表の列数整合・節順15／22／22。旧3設計書本文／レビューの全byteと既存422メソッド本文を保持。差分は今回の10ファイルだけ、diff --check成功・基準HEAD不変・index空 |

全体Vitest・実package-worker・実worker／runtime／transport・実source照合は行っていない。関連合成の成功を全体回帰・実機受入の成功とは呼ばない。製品・試験・外側processの期限は緩めていない。

## 費目・残課題

新mode flag・先行4scalar、module固定の凍結値表／key表5個、有限shape／状態・pre／post検査、初期ownerの直接比較、固定診断分岐、凍結facade／非終端projectionが追加費目。固定表や値checkerの存在は実予算／cap承認やsource発行証拠ではない。既存root・37slot・owner／S／利用claim／trial／call／cacheを二重発行しない。

次のR-bは元R/S/Tのprivate供給・元callの実復帰・実参照／全安定条件・失敗prefixとseal／単一cacheを一体接続する必要がある。今回のpure positiveや初期診断から復元しない。実受理・G_R／G_A・C-03・body・正式発行は未接続、全体受付無効・調査保留を維持する。実E／S・unit／全体work・layout／allocation／GC／OOM・停止後解消予約・診断必着・cleanup／借用退役はUnknown。実装時点ではindex登録・コミット・Pushは行っていない。

## レビュー修正（2026-11-13）

レビュー基準HEAD `88204c5`。R-aの追加コードへ84件の一時変異を入れ（各変異の後でfixtureを復元）、両方を通った節に単独のcompiled対照を足した。fixtureの挙動・期待値は変えていない。

| 観測 | 対応 |
|---|---|
| 一時変異84件：Vitest kill 12件・compiledだけでkill 45件・両方通過27件 | 22件は単独対照の不足としてkill。残る5件は[returned差分設計§16](BEST_PRACTICE_WFB_BODY_PIN_RETURNED_ACCEPT_SEAL_DESIGN.md)に等価節として記録 |
| 初期owner確認の不在節14件が単独で外れても、残存cell・source issued・4scalar等の既存15対照では拒否位置が変わらなかった | seed・draft・probe owner・binding・run link／duty／seal・seed shell・生成試行・metadata確認・build段階・route試行・source current／rejectedを1fieldずつ壊す対照を追加（初期owner対照15件→29件） |
| 公開projectionの7項目を初期値の固定literalへ置き換えても通った | stateValid・fixedCalls・sourceGenerations・cacheRetained・sealed・attempts・bodyStartsの実slotを動かす投影対照を追加（投影対照4件→11件） |
| 共通値検査からphase checking節を外すと、post検査が状態型として正しいacceptedを通した | accepted（post=true、現在点post／blocked）をpre／postへ渡す3対照を追加し、状態型としては有効でもpre／postでは拒否することを確認 |

修正後のcompiled出力は`laterStates: 3`・`initial: 29`・`projection: 11`。他の件数（450状態・136leaf・60shape・81位置組・型拒否9行）は変わらない。

## コミット対象だけの隔離再検証（2026-11-13）

基準HEADを一時ディレクトリへ書き出し、今回の10ファイルだけを反映した。既存node_modulesだけを参照し、追加導入・設定変更・他の未コミット内容の取込みはない。対象10ファイルの作業元／隔離コピーのSHA-256一致を確認した。

隔離コピーでbuild・明示対象のstrict TypeScript・変更5ファイルのlintはexit 0。関連合成は44ファイル3,307件成功、失敗0。compiled34本は全exit 0、失敗／timeout 0。各processの外側60,000ms上限と既存の製品・試験期限を維持した。

梱包dry-runは441files、workerあり、src／tests／fixture混入0。ignore-scripts／offline・一時cacheを使用し、実archive生成・導入・実package-worker起動は行っていない。文書5件のローカル参照45件・34表も整合した。関連回帰を全体回帰・実機受入の成功とは呼ばない。

検証後の変更は本記録の履歴表現と追記だけで、実装・試験への追加変更はない。本記録だけを隔離コピーへ同期し、10ファイル全byteと文書整合・差分・indexの対象を再確認してから、今回の10ファイルだけをコミットする。実受理・G_R／G_A・C-03・body起動と正式発行口の閉鎖、全体受付無効・Unknown・調査保留を維持する。実接続・実通信・設定変更・Pushは行わない。
