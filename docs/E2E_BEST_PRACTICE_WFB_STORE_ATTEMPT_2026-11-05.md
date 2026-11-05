# WF-B Store：呼出し単位の試行結果・cleanup分離の検証

Date: 2026-11-05 / 基準HEAD: `85eb9ad` / 未コミット変更を検証。

## 1 範囲

[EvidenceStore内部契約](BEST_PRACTICE_WFB_EVIDENCE_STORE_FAKE_CONTRACT.md)§6に従い、試験専用kernelの保存試行結果を実装し、bound bridgeへ接続した。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持。実保存・再採取・既存証拠copy／保管操作・実接続・実通信・設定変更・Pushは未実施。運用cap／時間枠は未承認のまま。

製品src・設定・依存は変更していない。Storeの期限表は変更せず、次段階とする。旧receipt-only saveとsnapshotの形／Store-wide first reasonは維持する。

## 2 実装・合成対照

- `saveAttempt`は各呼出しで新しいlocal recordを作り、結果とattemptを凍結して返す。共有last-resultを使わない。create前拒否、create試行失敗、取得済み未検証、保存receipt発行を区別する。
- create／handle／closeの各flag、byte予約、主理由とcleanup理由を独立保持。sticky／busy拒否も専用recordを返し、前回cleanupやbyte予約を写さない。結果は限定DATAであり認証・保存証拠の昇格口ではない。
- memory driverの操作列／呼出し数からcreate／closeのflagと分類を独立判定する。入力・root・期限の拒否はcreate=0、create false／throwはcreate=1・close=0、取得後失敗はclose最大1。golden digest・旧private consumer照合も維持する。
- 成功→create失敗→sticky拒否、成功→consume失敗→sticky拒否、create／write／close中の再入を比較し、内側と外側の結果が別objectであること、以前の結果が後から変わらないことを検証する。
- writeの主失敗＋cleanupのfalse／不正clock／期限切れ、期限後closeのlateを確認。close未試行とclose失敗も分離し、Store first reasonを置換しない。
- bridgeは同戻り値のattemptをslotへ保持。byte予約不足／create失敗／取得後失敗の詳細を確認し、前のack成功slotは保持する。戻りがない異常ではattemptをsnapshotから捏造しない。

## 3 結果と途中の失敗

すべて`bdo`経由。製品・試験期限を変更していない。

- 最初の回帰: **4件失敗・321件成功**。bridgeが新saveAttemptを呼ぶ一方、旧withSave試験はpublic saveを差替えており、照合不一致3件とthrow対照1件が狙った境界へ届いていなかった。
- 原因確認後、故障注入helperだけをsaveAttemptへ移した。保存slot／size／digestを変えた本物receiptを作る対照と、戻り前throwの対照は維持し、旧save互換性は別試験で確認する。
- 新規22件を追加し、対象4ファイルは**347件成功**（旧325件＋新規22件）、最終147ms。
- kernelと対象4試験のstrict単独TypeScript検査: 成功。
- 変更fixture／試験のESLint、`npm run build`: 成功。

最終の型／lint・`git diff --check`は成功。文書リンク10件、kernelの依存がcryptoだけでtestsが製品build／package許可対象外である構成も確認した。構成確認は実梱包成功の代替ではない。全体回帰・梱包dry-run・compiled試験は今回未実施。前段の全体成功は今回の変更の検証へ流用しない。

## 4 レビュー修正（2026-11-05）

`fb91044`のレビュー指摘を修正した。実装の不具合はなく、kernelは変更していない。§3の件数は修正前の記録で、そのまま残す。

| 指摘 | 修正 |
|---|---|
| closeのthrowが試行済みになること、close成功後の時計不正、失敗経路の`late`に対照がなかった | 通常経路と失敗後cleanupの両方で確認する単体試験を5件追加した |
| bridgeが戻り値のattemptからcleanupを取り、reasonはStore全体のfirst reasonを保持することが未検証だった | 戻り値のobjectそのものを保持する対照と、拒否された保存の対照を追加した |
| BR04が求める部分書込・EINTR境界のbridge対照がなかった | write throw、部分書込後のthrow、再試行上限超過、上限内の部分書込とEINTRの4件を追加した |
| 契約§3の「接続は未実装」、実装の所在、設計§5の「cleanup四値」、BR04の状況、設計の基準HEADが実態と違っていた | 文書を訂正した |

拒否された保存の対照は、公開Store `saveAttempt`のprototypeを差し替え、呼出しの直前にStoreを取り消す。bridgeは健全時しか保存を始めないので、通常経路では到達しない。bound経路の成功実証ではない。

kernelの変異は、元の43個のうち40個を検出した。§3の時点で生存した8個のうち5個は新しい対照で検出し、残る3個は次の理由で等価と判断した。追加の5個（attemptのコピー、`receipt`なしを致命的停止にしない、再試行の上限なし、EINTRの即失敗、部分書込の完了扱い）はすべて新しい対照で検出した。

| 変異 | 理由 |
|---|---|
| `finally-deadline-no-fail` | finallyのcleanupに入る時点で主失敗が必ず記録済みなので、`#fail`は何も変えない |
| `attempt-reason-no-default` | 失敗経路はすべて`#reason`を設定するので、`?? 'binding'`には到達しない |
| `attempt-reason-kept-sticky` | sticky／busy拒否はtryの前に返り、finallyを通らない |

全スイート（`--maxWorkers=3`）は292ファイル・**14,148件すべて成功**（対象4ファイルは358件）。`npm run lint`はエラー0、`npm run build`は成功、`package-http-classification`はPASS（441ファイル）、`git diff --check`も成功。strict単独TypeScript検査も成功。梱包dry-runは未実施。

## 5 残課題

slot区分別の固定期限表・manifest専用枠、保存経路Closed後のrecorder最終終端、上位通知throw／部分生成失敗と詳細費目の連続対照が残る。本文／容量モデル・ProcessOwner・manifest集合・session台帳・OS backend・実承認は未対応。

partial_unverifiedは「handleを取得したがreceiptを発行できない」であり、実bytesが何byte保存されたかやdurabilityを証明しない。create失敗で未回収resourceを作らないdriver前提もOSでは未実証。cleanup confirmedはfake handleの報告で、process終了やrun全体の保全とは別である。
