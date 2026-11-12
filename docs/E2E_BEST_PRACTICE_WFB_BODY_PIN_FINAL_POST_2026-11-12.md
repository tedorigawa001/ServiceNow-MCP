# WF-B：(C-c)最終post・内部accepted・元caller固定未接続停止の合成検証

Date: 2026-11-12 / 基準HEAD: `b4a0c677ad2291aa8ec7a6fb0c8ce7553a41c4cb` / 実装時点は未コミット。コミット準備時の隔離再検証は末尾へ分離する。

## 範囲と維持条件

[C詳細設計draft-0.6 §19](BEST_PRACTICE_WFB_BODY_PIN_FINAL_RETURN_CACHE_DESIGN.md)の(C-c)だけを合成依存限定で接続した。package除外のcomposition fixtureへ別のfresh constructor mode／createProbeBodyPinFinalPostFakeを追加し、元root／source／start、prepared・中間post・実I/C/J、元call、既存非割当て診断writer、単一cache／外側公開wrapperを再利用する。既存C-b factory・旧A/Bの固定拒否と期待値は変更しない。

正式発行口・既存C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。PC08のreturned全照合、BP04／C-03、source利用claim消費・payload借用／bind・構築ready・Journal供給・field clear／root終端へ進めない。実接続・実通信・実機操作・設定変更・トークン／permit発行・Pushは行わない。依存導入・manifest／lockfileの変更もない。

開始時のworktreeはcleanで、基準HEADのC-a allowlist／strict boolean・11非echo対照、C-bのfailRecord単一記録経路・旧Bとのpipeline一致・公開／再読9対照と過去の等価判断を維持する。今回の変更は合成fixture・試験／compiled監査・CHANGELOG・設計3文書・本記録だけで、srcの変更はない。

## 接続した固定境界

| 境界 | 実装と確認した事実 |
|---|---|
| 最終post前 | Bのblocked成功直後・失敗writer前だけから分岐。同root／source／元start、実I/C/J・元metadata／live参照・空payload、prepared／中間post、元call／busy、最終marker false・未seal／未生成・先行診断なしを照合 |
| G_P | checker成功から境界after→既存marker true→literal acceptedの3文だけ。receiver／dispatcherの既存finallyは各自busy／callActiveをfalseにする直接代入だけ |
| 元caller | 同start／1実callの原始返値とmarker／receiver firstを分類。正常calleeはfirst none、上位はconstruction_unconfirmed／pin_return_not_connected／ok=false、root call位置after・source BP03／call・claim unused |
| 最終観測の停止 | close／priorは同C-c call活動中のfinal_post_beforeだけで非割当ての先行診断を記録。before位置を保持し、元caller分類までseal／返答生成しない。前段とC-bは旧failRecord単一経路のまま |
| 復帰喪失 | marker trueでも実primitive未復帰はunreturned。receiver finally異常のbusy=true、元I/C/J、source、未確認責務を修復／clearしない。正常な上位停止をcallee最終post失敗点へcopyしない |
| 単一cache | 原始診断・disposition・sealの後だけ既存materializerへ。元#fixedだけに保持し、同public入場の実復帰／frame非活動／同参照を確認して閉鎖診断を再読。生成／freeze失敗はfailed_empty、保持後の外側throwはfailed_cached、どちらも再生成なし |
| 公開値 | 既存allowlistとstrict booleanを維持。C-cの接続表示はsynthetic_only、finalPost／acceptedReturnsは実start／実call-resultの有限診断。cache・source・pin・能力は公開しない |

acceptedは内部通知だけであり、source受理／利用資格・PC08・cleanup完了・外部保存ackではない。callActive／entryBusyの解除、非終端通知、cache保持・再読も参照退役の証拠ではない。

## 新規の合成・compiled対照

新Vitest17件：正常callee／上位停止1、最終close1、throw／先行診断2、再入1、返答freeze／root finally失敗2、C-bとの前段pipeline一致9、開始前close／公開object非採用1。比較は期待する有限結果を試験側へ直接固定し、実装checkerから期待値を生成しない。C-cの接続表示4項目を除いた前段pipelineがC-bと完全一致することを確認する。

| compiled対照 | 範囲 |
|---|---|
| 実field故障23件 | receiver実I/C/J・stage／step／busy／marker・中間post／参照post・hold／payload／first／dutyの15件、root prepared／stages／sourceReason／診断記録／分類／初回点／disposition／cache phaseの8件 |
| 独立検査 | 実step破損に対する最終checker全体省略、実C同値copyと値view偽装、実参照節省略の対照。型エラーではなく到達marker／first／dispositionの差で検出 |
| 未信頼候補 | currentへProxyを注入し、診断・inspectまでget／ownKeys／getPrototypeOf 0。公開object／callbackをfactoryへ渡してもhook 0 |
| 内部復帰異常 | marker後のprimitive喪失、receiver finally未解除、marker writer欠落、第2call、保持後の外側finally throw。markerは事実のまま、accepted数・completion・failurePoint・busyを別に確認 |
| cache／停止 | strict10項目・frozen・元#fixed同参照、失敗cacheの非再公開／非再生成・source保持、active close直後はseal false／attempt false／cacheなし／result none／before診断 |
| AST | G_Pの最後3文・固定finally各1代入、C-c限定分岐／最終点writer／先行診断branch、非割当てcaller全体とseal直後の固定通知を確認 |
| semantic compile-fail | private最終checker／event／caller／callee、markerへの外部書込み、不正最終点、公開値からsource復元、不正opの8行を拒否。既存source本体に型エラーがないことも確認 |

旧監査の拡張は新C-c専用method／fieldのliteral writerだけに限定する。C-aはmethod内閉鎖監査、A/B／C-bは最終marker writer 0・accepted拒否の意味を維持する。新監査が全classの唯一のmarker writer（true、completeBodyPinFinalPost）を確認する。旧callerのprimitive prefixは先頭の固定C-c転送だけを分離し、残る旧prefixの非割当て制約を維持する。protectedなroot route boundaryは新callerの1fieldだけを許可し、claim／payload／bindのwriterは許可しない。

## 初回失敗と修正

| 初回の観測 | 原因・対応 |
|---|---|
| 正常／close／throw／prior／再入・返答失敗・前段比較のRED | 未追加のfactory／有限script／接続表示を段階ごとに先に期待した。固定literalだけを追加し、公開object登録や自由callbackは追加しない |
| root sourceReason故障で最終markerがtrue | 最終checkerがrootの先行診断／cache初期状態を検査していなかった。sourceReason・診断記録・分類・初回点・disposition・cache phaseの未使用条件を追加し、8root対照で拒否を確認 |
| 第2call対照でfinal failurePointが合成された | callerの安全なfallback marker=falseを実最終失敗へ誤写像していた。同元startかつ実call数1のときだけ初回最終失敗点を記録し、不正call数ではnoneを保持 |
| 関連回帰3,239件中1件失敗 | fresh合成factoryを追加したため、明示export一覧が旧集合のままだった。Vitestとcompiledの一覧へ新factoryを追加。旧exportの削除／改名はない |
| 旧compiled contractsのforbidden operational write | 新callerの既存route boundary=afterが監査表へ未登録だった。同method／同fieldだけを追加し、再確認。他のprotected fieldの制約は維持 |
| 補助的な共有method保持確認の初回エラー | 簡易文字列抽出が全methodをprivateと仮定し、既存public materializerを見つけられなかった。ASTで名前とownerから抽出し直し、共有6methodの完全一致を確認。実装変更は不要 |

先行理由保持の修正を、新しい最終phase以外へ広げていない。旧C-bレビューで得た25節／C-aの5節の等価判断は履歴として維持するが、新checkerの各節の網羅的変異・新段階での全等価再認定は行っていない。FRT01〜16の全項目・全故障組合せの受入完了とはしない。

## 実装時点の検証

| 検証 | 結果 |
|---|---|
| 新Vitest | 17件成功、失敗0 |
| 関連Vitest | 43ファイル3,239件成功、失敗0（基準3,222件＋新17件） |
| 新compiled | exit 0、実field23件・型拒否8行・G_P／非割当てcaller・復帰異常・単一cache対照成功。監査追加後にも再実行 |
| 新旧compiled33本 | 初回は32本成功・contractsの監査登録漏れ1本失敗、timeout 0。同1本の再確認はexit 0。修正後の33本一括再実行は全exit 0、失敗／timeout 0。processごとの外側60,000ms上限を維持 |
| strict TypeScript | composition fixture・probe-body全試験・composition試験の明示対象でexit 0 |
| lint | 変更10ファイルの最終対象集合でexit 0 |
| build | exit 0 |
| 梱包dry-run | 441files、workerあり、src／tests／fixture混入0。ignore-scripts／offline・一時cache、実archive生成／導入なし |
| 文書・差分 | 最終追記後の文書5件のローカル参照52件に欠落0、36表の列数整合、節順19／21／23。旧本文・レビュー3文書と共有6methodの完全保持を確認。diff --check成功、index空、基準HEAD不変 |

全体Vitest・実package-worker・実worker／runtime／transport・実source照合は実行していない。関連回帰を製品の全体回帰や実機受入と呼ばない。製品・試験・外側processの期限を緩めていない。

## 追加費目・残課題

追加は固定mode1、固定最終イベント／checker、G_Pの既存slot書込み、原始分類・先行診断／seal、既存materializer／cache再利用と非終端projection。新source・borrow・利用claim・終端cacheの二重発行はない。clock／開始UTC／deadline／capの変更もない。実unit／全体work上界・layout／allocation／GC／OOM・停止後解消予約・診断必着・cleanup／参照退役はUnknown。

PC08・BP04／C-03の同source全安定／returned全照合・利用claim消費、payload借用／bind、構築ready・body・Journal供給・field clear／root終端、正式発行と全体受付は未接続のまま。今回のcallee完了・閉鎖診断再読を、その解禁条件として扱わない。調査保留を維持する。実装時点ではindex登録・コミット・Pushは行っていない。

## レビュー修正（2026-11-12）

レビュー基準HEAD `8ffaf0a`。C-c専用コードへの73件の一時変異（各変異の後でfixtureを復元）と、C-bの172 scriptをC-c modeで流す一時比較を行った。fixtureの挙動・期待値は変えていない。

| 観測 | 対応 |
|---|---|
| 一時変異73件：Vitest kill 15件・compiledだけでkill 23件・両方通過35件 | 35件のうち3件は既存compiled対照のassert不足。残る32件は[C詳細設計§20](BEST_PRACTICE_WFB_BODY_PIN_FINAL_RETURN_CACHE_DESIGN.md)に等価節として記録 |
| callerの`observed`からmarker条件を外すと、marker writer欠落対照でcompletionが`completion_observed`になった | marker欠落対照にcompletion inconsistent・finalPost falseのassertを追加し、kill |
| 公開投影のacceptedReturnsから実call数1の条件を外すと、第2call対照で1を数えた | 第2call対照にfinalPost true・acceptedReturns 0・completion inconsistentのassertを追加し、kill |
| callerの理由から`#closed`節を外すと、root closeだけの状態がpin_return_not_connectedになった | callee完了後・caller分類前に`#closed`だけを立てる対照を追加（first／disposition closed、finalPost true・acceptedReturns 1・completion_observed）し、kill |
| C-bの172 script（prefix148件を含む）をC-c modeで実行 | 最終postへ進む`cb_*`5件以外は、公開値・診断がC-bと完全一致（C-c接続表示4項目と追加投影2項目を除く）。前段の単一記録経路は変わっていない |

修正後の検証：lint・build・梱包分類はexit 0。全体Vitestは347ファイル18,196件成功・失敗0。compiled 14本（新C-cを含む）は全exit 0で、C-cの出力に`callerControls: 3`を追加した。`git diff --check`成功。正式発行口閉鎖・全体受付無効・Unknown・調査保留とPC08／C-03／body未接続を維持し、実接続・実通信・実機操作・設定変更・Pushは行わない。

## レビュー修正（2026-11-13）

レビュー基準HEAD `ed37be3`（PC08差分設計）。子設計§7の写像を現行fixtureと照合した結果、C-cの最終観測中の記録分岐だけが旧ownerと異なっていた。

| 観測 | 対応 |
|---|---|
| 最終観測中のinput_rejectedを、source first／sourceReasonでconstruction_unconfirmedへ写像していた（旧`fail()`系と子設計はstate_invalid）。現scriptからは到達しない | 最終観測点で入力拒否を記録するcompiled対照を先に追加し、source firstがconstruction_unconfirmedでREDになることを確認。記録分岐のsource写像にinput_rejected→state_invalidを追加してGREEN |
| 同対照による一時変異の再確認 | first写像からinput_rejectedを外す変異と、新しいsource写像を外す変異をkill。C詳細設計§20の等価節は32件から31件へ |

対照の確認値はroot first／disposition input_rejected、source first・sourceReason state_invalid、failurePoint final_post_before、finalPost false・acceptedReturns 0。C-cの出力に`finalInput: true`を追加した。他のscriptの挙動・期待値は変わらない。

## コミット対象だけの隔離再検証（2026-11-12）

基準HEADを一時ディレクトリへ書き出し、今回の15ファイル（合成fixture／試験・compiled監査10件、CHANGELOG・設計3文書・本記録5件）だけを反映した。既存node_modulesだけを参照し、依存導入・設定変更・他の未コミット内容の取込みはない。作業元と隔離コピーの15ファイルのSHA-256一致を確認した。

隔離コピーでbuild・明示対象のstrict TypeScript・変更10ファイルのlintはexit 0。関連合成は43ファイル3,239件成功、失敗0。新旧compiled33本も全exit 0、失敗／timeout 0。各processの外側60,000ms上限を維持し、製品・試験の期限は変更していない。

梱包dry-runは441files、workerあり、src／tests／fixture混入0。ignore-scripts／offline・一時cacheを使用し、実archive生成・導入・実package-worker起動は行っていない。文書5件のローカル参照52件・36表も整合した。関連合成を全体回帰／実機受入の完了とはしない。

検証後の変更は本記録の履歴表現とこの追記だけで、実装・試験への追加変更はない。本記録だけを隔離コピーへ同期し、15ファイル全byteと文書整合・差分・indexの対象を再確認してから、今回の15ファイルだけをコミットする。正式発行口閉鎖・全体受付無効・Unknown・調査保留とPC08／C-03／body未接続を維持し、実接続・実通信・実機操作・設定変更・Pushは行わない。
