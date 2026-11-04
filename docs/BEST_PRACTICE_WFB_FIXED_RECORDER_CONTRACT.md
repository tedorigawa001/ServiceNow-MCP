# WF-B 固定採取器の詳細契約・合成受入条件

Version: draft-0.1 / Date: 2026-11-04 / 設計基準HEAD: `0fe45fb`。

Status: **設計のみ。実装・試験・再採取・保管操作は未実施。** 正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。保存先・保持期間・容量・時間枠・停止方式は未承認のまま。実接続・実通信・設定変更・Pushを行わない。

親契約は[再採取・証拠保全手順](BEST_PRACTICE_WFB_RECAPTURE_EVIDENCE_PROCEDURE.md)。本書はそのR04／R07を具体化するが、R01〜R08の充足や操作承認を代替しない。以下の型名・定数・境界は後続実装への提案であり、現行runnerの保証ではない。

## 1 境界・所有者

| 境界 | 固定責務 | 持たせない権限／保証 |
|---|---|---|
| RecorderSupervisor | credentialを持たない外側owner。承認条件・run順・単調clock・停止・出力slotを管理 | ServiceNow通信、製品permit、追加runの自動生成 |
| CollectorChild | 固定checkoutの合成試験とbounded観測を実施し、限定messageを送る | 保存先選択、durable出力の直接更新、任意process停止 |
| EvidenceStore | 承認済みdirectory identityに対する固定名の排他作成・bounded書込・再読検証 | fallback先、上書きrename、存在確認後の通常write |
| ProcessOwner | 起動したrootと所有する子の登録・停止・終了確認 | 全Node停止、無関係PIDの探索・停止、PIDだけからの所有権推定 |
| RunLedger | 同session／run／承認版・固定入力digest・出力slotのprivate binding | JSONやsummaryからの権限再構成 |

EvidenceStore／ProcessOwnerのOS backendは**未選定・未実証**。symlinkを辿らないdirectory基準操作・no-replace publication・子孫追跡／封じ込めの実現方法を別途固定する。通常のNode API、process groupの空、rootのexitだけで全保証が成立するとは扱わない。detached子・PID再利用・登録外へのescapeを排除／検出できなければ終了確認はUnknown。

fixtureとruntimeのidentity台帳を共有しない。開発採取器の登録口を製品classや正式証拠発行口へ追加しない。保存済みreceiptは記録であり、private ownerの代用にならない。

## 2 状態・独立した終端結果

状態は `Gated → Reserved → Observing → Draining → Verifying → Published → Closed`。停止要求は任意の開始済み状態からDrainingへ一度だけ進める。fatal後の再開・claim初期化・同runの再生成を禁止する。通常のtest失敗はfirst anomalyとして保持するが、それだけでsuiteを打ち切らない。

| 結果軸 | 値 | 成立条件 |
|---|---|---|
| test_result | passed／failed／incomplete | 固定対象の試験終端。途中停止をpassedにしない |
| measurement | complete／incomplete | 必須観測と相関が揃い、欠落・上限超過・protocol破損なし |
| preservation | verified／unverified | 必須artifact集合・manifest・再読hashが整合 |
| termination | confirmed／unconfirmed | 所有processの終端とscope／runner解放を別々に確認 |

四軸を独立保持する。failedでも観測・保全・終了が成立し得る。passed、ready、reply matched、`report.final.json`の存在は他軸を成立させない。比較runは親手順の承認・選択条件に加え、先行runのmeasurement complete／preservation verified／termination confirmedが必要。最初の試験失敗・採取失敗・停止理由・cleanup診断を別slotに保持し、後続例外で上書きしない。

## 3 非上書き出力・publication

1. 実pathを含まない新規session／run IDを固定形式で発行し、同IDを再利用しない。承認済み保存rootの所有者・祖先・symlink・権限／ACL・容量を確認できない間は起動しない。
2. directory identityを保持し、固定allowlistの子名だけを排他作成する。既存名・競合・identity変更は拒否する。URL／sys_id／ユーザー文字列からpathを組み立てず、別保存先へ逃がさない。
3. 同slotの作成claimは失敗しても消費済み。short write等は有限の書込規則内だけで扱い、無制限retryをしない。flush／close／再読まで成功しないartifactはunverified。
4. `publishNoReplace`を保証できるbackendだけを採用する。通常の上書きrenameへのfallbackは禁止。stagingを使うなら固定slot・最大数・cleanup責務を事前にモデルへ追加する。
5. checkpointとfinalは別ファイル。crashで残った途中ファイルは元bytesを保持して未確認扱いとし、同名で作り直さない。後続のreadonly検査は成功への自動復旧や再実行を承認しない。
6. manifestは自身を除く必須artifactの名前・長さ・digest・結果を含み、最後に新規発行する。manifest digestは別のsession票に保持する。hashは真正性・承認・改変不能性を証明しない。

提案する固定出力は、run内の `conditions.json`、固定source写し3点、`report.partial.0001.json`〜`.0006.json`、`report.final.json`、`termination.json`、`analysis.json`、`manifest.json`。analysisには入力digestを結合し、入力が不完全なら結論も限定する。

session票はrun外の `session.0001.json`〜`.0003.json` とし、開設／run1結果と比較判断／閉鎖を追記型で表す。先行票digest・run順・run manifest digest・手元の実行開始／終了を結合し、既存票を更新しない。票衝突・未発行・整合不明なら次runを拒否する。既存手順の`session.json`はこの連番契約へ置き換える。

この構成は**最大14ファイル／run、2run＋session票で最大31ファイル**の新規canonical出力案。旧証拠保全・試験自身の一時出力・将来backendのstagingは別会計であり、この数に隠さない。実byte上限・必要空き容量・保持期間は未承認。ファイル数だけで容量安全を主張しない。

## 4 有限checkpoint・観測上限

checkpointは次の**6種類を各1回まで**。発生順に連番を割り当て、未発生の種類は省略する。同一triggerの反復は有限counterへ集約し、新規ファイルや無限queueを作らない。

| trigger | 保存する限定情報 |
|---|---|
| conditions_ready | 承認版・固定入力digest・開始条件。子起動より先に検証完了 |
| child_started | 所有leaseとprotocol開始の固定状態 |
| first_anomaly | 最初の試験失敗／採取失敗の区分・相関ordinal・固定理由 |
| slow_hint | 同一定義の経過が120秒を超えた最初の位置。**停止条件ではない** |
| test_terminal | 試験結果と観測完了状態 |
| stop_requested | 最初の取消／外側期限／採取器停止とcleanup開始 |

writerは1本、immutable snapshot queueは最大6件。per-case同期IO・周期無制限flush・古いcheckpointの更新を禁止する。queue拒否・snapshot上限超過・writer失敗では新規試験／比較を止め、既存checkpointと先行診断を残す。crash／OOM時に必ず保存できるとは主張しない。

WF-Aの4096件、既存reporterのcase／event各20,000件・sample600件・module1,000件の上限は拡張しない。必須coverageの欠落はmeasurement incomplete。各message・snapshot・final・analysis・manifest・session票のbyte上限、総byte上限、serialization／再読scratch上限を有限の必須条件として別途固定する。`0`／未指定を無制限へ解釈しない。概念上の保持量は集約本体＋最大6 snapshot＋writer／検証scratchであり、JavaScript heapの実測上界やRSS保証とは区別する。

## 5 外側時間枠・停止と終了確認

具体値と停止方式はR07の未承認事項。採取器独自の有限session枠・各run枠を設け、製品／試験timeout・並列設定は変更しない。最大2run案と、期間／回数つき通常実行への観測許可を区別し、後者で追加の試験実行を生成しない。

- run開始`t0`と外側単調clockを一度固定し、`D_all = min(t0 + T_outer, D_session)`とする。UTCは表示・相関用で、期限計算の代用にしない。fake timerへ切替わるclockを使わない。
- 同じ`D_all`の内側に、停止・強制停止確認・終了確認・flush／再読・manifest／session票の有限予約を置く。`D_stop = D_all − 予約合計`。開始条件の検査や保存に費やした時間も枠内であり、起動後に原点を作り直さない。
- 子起動直前の観測可能時間`D_stop − now`は、過去最大218秒に**承認済み正の観測余裕**を加えた値より大きいこと。218秒ちょうど・不足・未確定なら起動拒否。旧runner spanとの対応を条件票へ固定し、自然失敗を調べる時間帯を切り落とさない。
- 120秒はcheckpoint／比較判断の目安だけ。到達しても取消・期限延長しない。600 samplesもwall-time watchdogではない。
- `D_stop`／取消／fatalで新規dispatchを停止し、所有processへの協調取消、必要なら承認済みの強制停止を一度、有限の終了確認へ進む。停止要求を送っただけでconfirmedにしない。root終了後も登録子・worker・scopeの未解決責務を確認する。
- 遅延timer・suspend復帰時は次の遷移前に期限を再検査し、経過時間を免除しない。clock例外・不正値・逆行は停止と未確認診断。UTCの逆行から単調期限を再設定しない。
- 同期IO・OS停止・host suspendで監督自体が動けない可能性がある。backendの取消／終了確認能力が未実証なら「必ず時刻までに終了」を主張しない。`D_all`超過後の完了を枠内成功へ昇格せず、既存証拠だけで不足軸を未確認とする。
- 比較runにも残session時間・全予約・承認有効期間を再検査する。run1の枠を再起算しない。終了未確認・保全失敗・秘密検出・所有者不明なら次runなし。

終了確認には、元review drain、scope pending=0と観測対象worker exit、Vitest context.close、runner OS exit、ProcessOwnerの残責務を別fieldで保持する。WF-Aだけで観測範囲外の子まで終了したと推定しない。未解決ならUnknownを保持し、admission resetやmock復元で隠さない。

## 6 秘密非出力・承認境界

保存可能値は固定label／reason、数値・bool、承認済み環境項目、repo相対試験名・ordinalに限定する。env dump・認証情報・URL・response body・レビュー本文・生例外／stack・他processの名前／引数を保存しない。不正messageの内容を診断へ反射しない。

想定外の秘密は新規採取・共有を停止し、その場で未検証扱いにする。未承認の移動・削除・chmodをしない。redacted派生物は別ID／digestであり、原本と置換しない。保存先や所有者の実値は非公開条件票に置く。

歴史的な自然失敗・遅い成功・WF-B artifactの在庫／copyは親手順の別承認操作。本書を根拠に既存一時ファイルを開き直して保全・移動しない。保全だけの許可は再採取許可ではなく、欠けた原本を再構築して原証拠と呼ばない。

## 7 合成受入条件（未実施）

fake store／clock／processと注入messageのみで検証する計画。実保存先・real dispatcher・実workerは使わない。独立oracleは実装のplanner／判定関数を呼ばず、期待slot・試行数・期限・四軸を手計算した表とする。拒否試験では狙った境界への到達をassertし、先行gate失敗による見かけの成功を防ぐ。

| ID | 合成入力・故障注入 | 必須観測 |
|---|---|---|
| FR01 | 同名・同時作成競合、symlink／祖先差替え、owner／ACL不適合 | 上書き0・fallback0・子起動0。既存bytes不変 |
| FR02 | short write、有限retry内外のEINTR、容量不足、flush／close失敗、再読hash不一致 | 同slot再発行0、preservation unverified、先行診断保持 |
| FR03 | trigger順序の全組合せと反復、6件境界・過剰message／byte／queue | checkpoint最大6・連番一意・無制限flushなし。超過で停止 |
| FR04 | 最初のtest失敗後に別失敗、writer故障、crash相当の終端欠落 | first anomaly不変。残存partialをfinal成功へ昇格しない |
| FR05 | 120秒前後、218秒ちょうど、余裕／予約不足、session残枠不足 | 120秒で打切り0。起動条件不足ならdispatch0。原点不変 |
| FR06 | 遅延timer・時計例外／逆行・fake timer交換・各予約境界 | 同じD_allで判定、延長0、停止／保存／確認の段階を区別 |
| FR07 | rootだけexit、子残存・detached escape・PID再利用・偽exit、signal throw／確認期限切れ | 所有外停止0、termination unconfirmed、比較run0 |
| FR08 | 別run／directory／承認版receipt、二重consume、古い世代のcallback | private binding拒否・claim再利用0・先行結果不変 |
| FR09 | manifest失敗・session票衝突／digest不一致、run2開始要求 | 証拠を上書きせずrun2拒否。欠けた票を再生成しない |
| FR10 | passed／failed／incompleteと他三軸の成立／不足の組合せ | 四軸独立。passedだけで保全／終了や比較許可にしない |
| FR11 | 承認期限・回数上限、保全のみ／通常実行観測のみの許可 | 許可外操作0・追加run0。必要gateはANDのまま |
| FR12 | 原証拠欠落・hash不一致、秘密を含む不正message／throw | 原証拠の捏造0、秘密反射0、無断move／delete／chmod0 |

将来のcompiled／梱包試験では、fixture登録口・fake process／store driver・私的条件票・採取結果が製品配布物へ入らない負の対照を置く。値summaryからowner／claimを作れず、二重移譲・寿命外持出しを許さないことも確認する。これらは本書作成時点では未実施。

## 8 次の段階と未承認事項

1. 本契約のレビュー。有限状態・四軸・checkpoint planner・時間予約の純粋fake実装を最初の候補とするが、別途実装依頼を要する。
2. 非上書きstoreとProcessOwnerのbackend／上界・故障契約を選定し、合成対照から検証する。OS依存の保証不足をUnknownのまま残す。
3. byte／memory／retry／時間の具体上限、保存先・保持／削除・歴史的証拠copy・停止権限・通常run観測期間／回数を本人が承認する。設計定数6や31は操作許可ではない。
4. 固定版の入力digest・試験証拠を揃え、R01〜R08をその時点で再確認してから、保全／再採取を別々に判断する。

loader内部観測・stdio事前ビルド・AC-Cは別課題。本書は自然timeoutの原因確定、H5a／H5bの解決、正常sealや全体受付の有効化を宣言しない。
