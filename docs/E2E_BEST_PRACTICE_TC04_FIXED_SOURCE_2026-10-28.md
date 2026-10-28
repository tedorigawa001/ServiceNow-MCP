# TC-04：固定source bootstrap・release・用途descriptorの合成検証

Date: 2026-10-28 / 対象：[接続設計draft-0.5 §13](BEST_PRACTICE_ABORT_SCOPE_RUN_TRANSPORT_CLEANUP_DESIGN.md)。

## 1. 範囲と境界

- [run-stream](../src/review/abort-scope-evidence-run-stream.ts)の同module private coreで、新しいfake sessionを生成し、TC-03 transportをbootstrapから最終再読まで使い続ける。実sessionや旧fixture adapterを登録・採用する入口はない。
- TC-02の同private snapshot／readonly leaseにfake認証readyを1回だけ結合。per-user／cachedは設定された合成前提、exchangeも注入Response上のtoken/type/lifetimeの検証であり、実認証・本人確認・token発行ではない。
- 固定POST／GET descriptorは内部構築しfreezeする。raw body、token、metadata行、script／payloadを返さず、formal ReleasePermit／SourceRunEvidence／scope receipt／worker jobを発行しない。出力はsynthetic=true、evidence_issuance=disabled。
- production runtime・公開MCP入力／結果契約・依存・本番capは変更せず、開発専用prefixの既存npm梱包除外を維持する。

## 2. 合成テスト：追加51件

[run-fixed-source.test.ts](../tests/review/run-fixed-source.test.ts)と既存TC-01〜TC-03を合わせ、関連4ファイル206件を確認した。

| 群 | 検証内容 |
|---|---|
| 単一transport oracle | per-user／cachedはparent→release→metadata→parent-final→metadata-finalのC=5、exchangeは先頭POSTだけ加えC=6。Gはfixture JSONの独立UTF-8 byte総和、P=0。claim再生成・時計resetなし、ready_generation=1 |
| 固定descriptor | OAuthはPOSTラベルだけ、parentは固定Update Set sys_id、releaseはsys_cluster_state／build_nameのみ／limit21、metadataは固定update_set＋ORDERBYsys_idと版列だけ。method／path等のcaller入力口なし |
| bootstrap | per-user／cachedにPOSTなし。exchangeは大小文字を区別しないBearer、空token／type不正／残lifetime不足を拒否。tokenやraw Errorを保持・出力せず親GETへ進まない |
| release gate | 対象外family、複数node／設定衝突、未知family、欠落・不正・20node超でmetadataへ進まない。matched時だけ同sourceのopaque fake permit |
| C fallback | release-onlyの403／404／429／5xx、settled no_response、空観測についてcleanup confirmed後だけ設定assertionを採用。parentの403・release401・cleanup未確認・byte超過でfallbackしない |
| 設定binding | 既存pinReviewReleaseConfigでbinding・期限・hard全体の残有効性を確認。不一致はrelease GET前にunknown。asserted／observedの制限を分ける |
| metadata | 別Update Set・重複／非昇順sys_id・sentinel超過を拒否。max_records+1の観測とselected上限を区別。余分なpayload／内部列を保持・表示しない |
| state／identity | 二重bootstrap／parent／release、順序違反、foreign／clone permit、終了後再利用を拒否。外国run・closed診断は不変 |
| 最終再読 | 同permitでparent→metadataを再読し、normalized観測のstable_observation／changedだけを返す。scope証拠・seal・analysis完了ではない |
| 停止・所有 | 取消とsource commit間のmicrotask競合、clock／request capの継続、課金と解析で同じprivate byte snapshotを使うことを確認 |

### RED→GREEN・開発中に修正した点

1. factory未実装のREDから固定親・release・metadataのtracerを実装。
2. release403のbody=nullを先にinvalid_responseへ落としていたREDを再現し、HTTP拒否の分類とcleanup済みno_bodyを分離。releaseだけの例外を他用途へ広げない。
3. source read成功とpermit commitのmicrotask間で取消が届くと、matchedが返るREDを再現。全await後のsource commitで時計・停止・予定stageを再検査し、ready／permit発行を拒否する。
4. 注入clockがG採用後に元chunkを書き換えると別内容を解析するREDを再現。bounded private snapshotを作り、その同じbytesをG/S課金と解析に使うよう変更。
5. releaseの不完全JSON／行schemaをassertionで補わずobservation_incompleteのunknownとするREDを確認し、正常にcleanup済みのbounded本文だけをその分類へ送る。cap／期限／未確認cleanupをunknownへ格下げしない。
6. 段階実装中のビルドではparent保持値の未使用とResult<never>の分岐narrowing不足を検出。final再読接続と明示分岐で解消し、最終ビルドを再確認した。

## 3. 検証結果

| 検証 | 結果 |
|---|---|
| 関連4ファイルのVitest | 206件成功（新規51件） |
| `bdo npm run build` | 成功 |
| 変更対象2TS＋新規テストのESLint | エラー・警告なし |
| 全体合成 `vitest run --maxWorkers=3` | 168 files／5,001件成功、27.77秒。スキップなし |
| offline cacheでの`tests/review/package-worker.mjs` | 377 files、production-only install＋解析＋集約成功。新factoryも既存prefix除外で非同梱 |

全体合成のローカル待受はfixtureだけであり、実transport・PDI・実token発行・設定変更は対象外。

## 4. 残課題・維持する停止条件

- fake認証ready／permitを実session／AuthSnapshotIdentity・正式ReleasePermit・選択window／payload receipt・worker planへ昇格させない。今回payload／table／workerの取得・発行口は作成していない。
- retry、E/R/T予約、50/55秒のphase cutoff、本番mutable会計port、実OAuth／本人確認は未接続。TC-04のordinalは1だけ。C<=210・G<=16MiB・hard<=60秒等の既存上限と低減設定を維持する。
- captureはOAuth／親／release 16KiB、metadata 1MiBに限定。解析前後に期限を確認するが、同期JSON処理を物理的に中断する保証・allocation／control workの全体上界は未証明。
- scratch参照破棄は物理zero化やsource-owned Response／未決着Promiseの解放証明ではない。実OSでの終了保証も未証明。
- 次は正式binding・必要な選択／worker証拠の発行前提を整理する。正式発行口閉鎖、Unknown・全体受付無効、VM／監視／telemetry保留を維持する。
