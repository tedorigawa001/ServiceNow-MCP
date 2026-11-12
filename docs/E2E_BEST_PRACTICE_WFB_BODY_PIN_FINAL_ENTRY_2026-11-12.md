# WF-B：(C-b)fresh固定入口・単一終端・元外側復帰の合成接続

Date: 2026-11-12 / Version: draft-0.2 / 基準HEAD: `3d4fe965be22444faa57a740320cbc5b2c3e1c1f`。

対象は[C詳細設計§17](BEST_PRACTICE_WFB_BODY_PIN_FINAL_RETURN_CACHE_DESIGN.md)。実装開始時worktreeはクリーン。C-aの11非echo対照・672値組・12行型拒否と旧A／B試験を保持した。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実接続・実通信・実機操作・設定変更・Pushは行わない。draft-0.1の実装時にはコミットせず、その後のユーザー指示に基づく対象限定の再検証を末尾へ追記する。

## 接続範囲

package除外のcreateProbeBodyPinConfirmationFakeを別constructor固定modeとして追加した。元rootの既存構築を通り、元source／startで既存Bの中間確認まで進む。正常でもreceiver_unconfirmed／rejected_attempt・上位construction_unconfirmedで停止する。最終markerはfalse、最終post・accepted返却・PC08・C-03・構築ready・body・正式発行は未接続である。

generic fail／reply・prepare入口／catch・check／closeからlegacy cache生成より先に分岐する。prepareの既存try本体だけconstructClosedへ抽出し、元frameの内側で診断seal／単一materializerへ合流する。途中failは有限診断の直接記録だけ。metadata未確認候補は読まず、確認済みissued=current以外へ停止／失敗を書き込まない。元生成位置とBP02／BP03の初回位置は別に保持する。

active closeではstopと初回理由を先に保持するが、callee返値noneの時点ではseal／生成claimを消費しない。元callerの分類・診断記録後に固定終端へ進む。seal後のfirst noneも後発inputで上書きしない。inspectの不正引数は診断だけを残し、その場で公開入場・返答公開を代行しない。

固定public入口finalEntryがbusyを先に予約し、finalEntryInvokeの実復帰後にだけreturnedを記録する。frame=false・同#fixed参照・private_cached・seal／attemptを全確認した後、busy解除→replayable→同参照returnだけを行う。新しいpublic finallyはない。cache保持後に元prepareのfinallyがthrowすればfailed_cached、生成失敗ならfailed_emptyとし、自分のbusyだけ解除する。frameやcleanupを補完しない。replayableは閉鎖診断の再読だけで、外部受領ackではない。

4種の非終端通知はmodule側の凍結定数で、終端cacheではない。通知のfirst noneは操作診断snapshotではなく、元firstはownerへ保持する。終端objectは既存#fixedの1個だけで、legacyの15種類の返答cacheにコピーしない。

## RED／GREEN・初回失敗・環境制約

1. 通常のfresh入口1件をfactory未実装でREDにし、固定構築→閉鎖返答の同参照再読まで接続してGREEN。
2. freeze失敗・構築中close・外側finally throw・148構築境界・18 source／pin失敗・frame／cache保持後の再入を追加した。初回は各有限script未受付でRED、当該scriptだけを受付し、それぞれの経路を検証した。
3. 最初のstrictは既存prepareの返答型がok／dispositionまでしか保証しないことと、TypeScriptがmethod内private field更新を呼出し元のnarrowingへ反映しないため3エラー。内部返値の型を狭めすぎず、実参照／phaseのprivate matcherと定数view同一性で検査し直して解消した。guardを消して通していない。
4. 旧export集合1件は新開発factoryの期待値未登録で失敗。期待値2箇所だけへ新factory名を追記し、runtime／旧facade exportは変えていない。
5. 旧C-a compiledのclass全体writer=0条件は新C-b writer9箇所で失敗。C-a methodのwriter=0を維持し、C-b側へfield／method別の明示監査を追加した。11非echo対照など既存条件を削除していない。
6. 新compiledのprefix対照は存在しないpipeline.route.startを参照して失敗。scratch専用で実startStepを観測するよう訂正した。またpc_close_checkedはguard到達前にthrowするため省略対照にならず、returnで止まるsi_proxyへ切り替え、guard省略時だけstartStepがidentityへ誤進行することを確認した。製品・fixture挙動を変えた修正ではない。
7. 一時的な状態読取りに使おうとしたtsx CLIはローカルIPC待受のEPERMで、対象moduleを実行する前に停止した。環境設定や権限を変更せず、既存source／Vitest／scratch compiledの確認へ戻した。これは製品timeoutや退行ではない。

期限・設定・既存A／B期待値は緩めていない。

## 受入条件と保証範囲

新Vitest174件：通常1・freeze失敗1・active close1・外側finally失敗1・固定構築37×4境界148・source／pin失敗18・frame／cache再入2・開始前close1・不正入力／hook非実行1。構築prefixは独立した原始indexと条件式から保持数を算出し、実装のbuilder／checker／scheduleを期待値へimportしない。

| compiled対照 | 確認した範囲 |
|---|---|
| 終端7経路 | 通常・最初／最後の部分生成・metadata未確認・部分metadata・preflight close・callee closeでstrict10項目・freeze・元#fixed同一性・legacy cache15種が空を確認 |
| 外側復帰 | 同frameを活動にしたまま実復帰させても拒否し、強制falseにしない。返答同値copyは拒否し、実参照guardだけ迂回すると誤公開へ変わる対照 |
| 入場と再読 | cache保持後に別methodが戻っても元退出に代用しない。busy guard除去時は結果が変わる。replayable後に退出をthrewへ壊すと再読を拒否 |
| 失敗保持 | 元root finally throwはcacheを保持したままfailed_cached。同prepare／check／legacy／closeから再公開・再生成しない |
| active診断 | callee close直後にfirst closed／result noneだがseal=false／cache空／attempt=falseをscratchで観測。元返値復帰後に初めてseal済みとなる |
| 早期停止 | C-b fail分岐を外すとlegacy cache混入で拒否。uncached failure guardを外すとsi_proxyの後にpin開始位置へ誤進行する |
| AST／型 | field別・method別writer許可先、先行固定mode分岐、public finallyなし、最後の3操作を固定。private終端／invoke／matcher・不正op・公開値からの参照復元の6行をsemantic拒否 |

## 実装時点の検証結果

| 検証 | 結果 |
|---|---|
| 新合成 | 174件成功、失敗0 |
| 関連合成 | 42ファイル3,200件成功、失敗0（新174件を含む） |
| 新compiled | exit 0、6行型拒否・固定公開群・active close未seal・実参照対照を確認 |
| 新旧compiled計32本 | 既存31本と新1本がすべてexit 0、失敗／timeout 0。各process外側60,000msを維持 |
| strict TypeScript | composition fixture・probe-body全試験・composition試験の明示対象でexit 0 |
| lint | 変更6ファイルでexit 0 |
| build | exit 0 |
| 梱包dry-run | 441files、src／tests／fixture混入0、workerあり。ignore-scripts／offline。実archive生成／導入なし |
| 文書・差分 | 文書4件・ローカル参照43件の欠落0、32表の列数整合、行末空白なし。diff --check成功、index空、基準HEAD不変 |

全体Vitest・実package-worker・実worker／transport・実source照合・トークン／permit発行は実行していない。関連回帰を全体回帰の完了とは呼ばない。

## 残課題と費目

C-cの最終post→非介在のliteral accepted→元callerの固定未接続停止は未実装。C-bの閉鎖診断の再読を、同sourceのreturned全照合・PC08・BP04／C-03・利用claim消費・bodyの解禁条件にしない。旧C-aの5等価節は元shellでの履歴として維持し、C-bの全新節の網羅的変異を完了したとはしない。

固定mode／4通知／wrapper・有限op選択／入場・退出・seal・公開・再読guard、既存slotへの有限診断書込みと37slotのprefix投影を追加費目へ置く。新source・owner・利用claim・本文は二重発行しない。全体work上界・実unit・layout／allocation／GC／OOM・停止後解消予約・診断必着はUnknownのまま。cleanup・退役・責務解消も未確認のまま保持する。

## コミット対象だけの隔離再検証（2026-11-12）

同じ基準HEADを一時ディレクトリへ書き出し、今回の11ファイルだけを反映した。依存は既存node_modulesだけを参照し、追加導入・設定変更は行わない。worktreeと隔離コピーの11ファイルのSHA-256一致を確認し、その他の未コミット内容を持ち込まず再実行した。

隔離コピーでbuild・strict TypeScript・変更6ファイルのlintはexit 0。関連合成は42ファイル3,200件成功、失敗0。梱包dry-runは441files、src／tests／fixture混入0、workerあり、実archive生成／導入なし。compiled32本はすべてexit 0、失敗／timeout 0。各process外側60,000ms上限を維持した。

今回の追記は検証記録だけで、実装・テスト・manifest／lockfile・設定への追加変更はない。検証後はこの記録だけを隔離コピーへ同期し、対象全byteの一致・文書整合・差分・indexの対象を確認してから保存する。最終post・accepted返却・PC08・C-03・bodyは未接続、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、Pushは行わない。
